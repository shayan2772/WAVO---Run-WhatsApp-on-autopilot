import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { parse } from 'csv-parse/sync';
import { createLogger } from '../../common/services/logger.service';
import { Contact } from './entities/contact.entity';
import { ContactList } from './entities/contact-list.entity';
import { ContactListMembership } from './entities/contact-list-membership.entity';
import { normalizePhone } from './phone.util';

export interface ImportResult {
  imported: number;
  duplicatesMerged: number;
  invalid: number;
  invalidSamples: string[];
}

@Injectable()
export class AudienceService {
  private readonly logger = createLogger('AudienceService');

  constructor(
    @InjectRepository(Contact, 'data') private readonly contactRepo: Repository<Contact>,
    @InjectRepository(ContactList, 'data') private readonly listRepo: Repository<ContactList>,
    @InjectRepository(ContactListMembership, 'data')
    private readonly memberRepo: Repository<ContactListMembership>,
  ) {}

  // ---- Lists -------------------------------------------------------------

  createList(businessId: string, name: string, description?: string): Promise<ContactList> {
    return this.listRepo.save(this.listRepo.create({ businessId, name, description: description ?? null }));
  }

  listLists(businessId: string): Promise<ContactList[]> {
    return this.listRepo.find({ where: { businessId }, order: { createdAt: 'DESC' } });
  }

  async getList(businessId: string, listId: string): Promise<ContactList> {
    const list = await this.listRepo.findOne({ where: { id: listId, businessId } });
    if (!list) throw new NotFoundException('List not found');
    return list;
  }

  async deleteList(businessId: string, listId: string): Promise<void> {
    await this.getList(businessId, listId); // ownership check
    await this.memberRepo.delete({ listId });
    await this.listRepo.delete({ id: listId });
  }

  // ---- Contacts ----------------------------------------------------------

  /** Upsert a contact by (businessId, phone) and (optionally) attach it to a list. */
  async upsertContact(
    businessId: string,
    input: { phone: string; name?: string | null; attributes?: Record<string, unknown>; source?: string },
    listId?: string,
  ): Promise<Contact | null> {
    const phone = normalizePhone(input.phone);
    if (!phone) return null;

    let contact = await this.contactRepo.findOne({ where: { businessId, phone } });
    if (!contact) {
      contact = await this.contactRepo.save(
        this.contactRepo.create({
          businessId,
          phone,
          name: input.name ?? null,
          attributes: input.attributes ?? {},
          source: input.source ?? 'manual',
        }),
      );
    } else if (input.name || input.attributes) {
      // Enrich existing without clobbering: merge attributes, fill name if empty.
      contact.name = contact.name || input.name || null;
      contact.attributes = { ...contact.attributes, ...(input.attributes ?? {}) };
      contact = await this.contactRepo.save(contact);
    }

    if (listId) await this.attachToList(listId, contact.id);
    return contact;
  }

  private async attachToList(listId: string, contactId: string): Promise<void> {
    const existing = await this.memberRepo.findOne({ where: { listId, contactId } });
    if (existing) return;
    await this.memberRepo.save(this.memberRepo.create({ listId, contactId }));
    await this.listRepo.increment({ id: listId }, 'contactCount', 1);
  }

  listContacts(businessId: string, listId: string, limit = 100, offset = 0): Promise<Contact[]> {
    // Contacts in a list: join via memberships. Kept simple with a two-step lookup.
    return this.memberRepo
      .find({ where: { listId }, take: limit, skip: offset, order: { createdAt: 'DESC' } })
      .then(members => {
        if (members.length === 0) return [];
        return this.contactRepo.find({ where: { businessId, id: In(members.map(m => m.contactId)) } });
      });
  }

  /** Global opt-out for the business (by contact id). Excluded from all future campaigns. */
  async optOut(businessId: string, contactId: string, reason?: string): Promise<Contact> {
    const contact = await this.contactRepo.findOne({ where: { id: contactId, businessId } });
    if (!contact) throw new NotFoundException('Contact not found');
    contact.optedOut = true;
    contact.optedOutAt = new Date();
    contact.optOutReason = reason ?? null;
    return this.contactRepo.save(contact);
  }

  /** Opt-out by phone (used by the inbound STOP-keyword handler). No-op if unknown. */
  async optOutByPhone(businessId: string, phone: string, reason = 'inbound keyword'): Promise<void> {
    const norm = normalizePhone(phone);
    if (!norm) return;
    await this.contactRepo.update(
      { businessId, phone: norm },
      { optedOut: true, optedOutAt: new Date(), optOutReason: reason },
    );
  }

  /**
   * Process an inbound message for marketing purposes: stamp engagement (improves the reply-ratio
   * anti-ban signal) and honor STOP/UNSUBSCRIBE opt-out keywords. Only affects an EXISTING contact of
   * the business — no-op otherwise. Fire-and-forget from the inbound path.
   */
  async handleInbound(businessId: string, phone: string | null, text: string): Promise<void> {
    const norm = phone ? normalizePhone(phone) : null;
    if (!norm) return;
    const optOut = /^\s*(stop|unsubscribe|stop all|cancel|opt[\s-]?out)\s*!?\s*$/i.test(text || '');
    const patch: Record<string, unknown> = { lastInboundAt: new Date() };
    if (optOut) {
      patch.optedOut = true;
      patch.optedOutAt = new Date();
      patch.optOutReason = 'inbound keyword';
    }
    await this.contactRepo.update({ businessId, phone: norm }, patch);
    if (optOut) this.logger.log('Contact opted out via inbound keyword', { businessId, phone: norm });
  }

  /**
   * Resolve the deduped, opt-out-filtered recipient set for a campaign from one or more lists.
   * Returns Contacts (with attributes for merge fields).
   */
  async resolveRecipients(businessId: string, listIds: string[]): Promise<Contact[]> {
    if (listIds.length === 0) return [];
    const members = await this.memberRepo.find({ where: { listId: In(listIds) } });
    const contactIds = [...new Set(members.map(m => m.contactId))];
    if (contactIds.length === 0) return [];
    const contacts = await this.contactRepo.find({ where: { businessId, id: In(contactIds) } });
    return contacts.filter(c => !c.optedOut);
  }

  // ---- CSV import --------------------------------------------------------

  /**
   * Import a CSV into a list. Expected headers include `phone` (required) and optionally `name` plus
   * any other columns, which become merge-field attributes. Upserts by (businessId, phone).
   */
  async importCsv(businessId: string, listId: string, csv: Buffer | string): Promise<ImportResult> {
    await this.getList(businessId, listId); // ownership check
    let rows: Record<string, string>[];
    try {
      rows = parse(csv, { columns: h => h.map((c: string) => c.trim().toLowerCase()), skip_empty_lines: true, trim: true });
    } catch (err) {
      this.logger.warn(`CSV parse failed: ${String(err)}`);
      throw new NotFoundException('Could not parse the CSV file');
    }

    const result: ImportResult = { imported: 0, duplicatesMerged: 0, invalid: 0, invalidSamples: [] };
    const seenExisting = new Set<string>();

    for (const row of rows) {
      const phoneRaw = row['phone'] || row['number'] || row['mobile'] || row['whatsapp'] || '';
      const phone = normalizePhone(phoneRaw);
      if (!phone) {
        result.invalid++;
        if (result.invalidSamples.length < 5) result.invalidSamples.push(phoneRaw || '(empty)');
        continue;
      }
      const { phone: _p, number: _n, mobile: _m, whatsapp: _w, name, ...rest } = row;
      const wasExisting = seenExisting.has(phone) || (await this.contactRepo.findOne({ where: { businessId, phone } })) != null;
      const contact = await this.upsertContact(
        businessId,
        { phone, name: name || null, attributes: rest, source: 'import' },
        listId,
      );
      if (!contact) {
        result.invalid++;
        continue;
      }
      seenExisting.add(phone);
      if (wasExisting) result.duplicatesMerged++;
      else result.imported++;
    }

    this.logger.log(`CSV import into list ${listId}`, { businessId, ...result });
    return result;
  }
}
