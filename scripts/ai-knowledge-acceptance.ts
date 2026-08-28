import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createAiKnowledgeRepository, createPool } from '@wsadmin-business/database';

async function main() {
  const pool = createPool();
  const tenantA = randomUUID();
  const tenantB = randomUUID();
  try {
    for (const [tenantId, name] of [[tenantA, 'A'], [tenantB, 'B']] as const) {
      await pool.query(`INSERT INTO tenants(id,name,slug) VALUES($1,$2,$3)`, [tenantId, `Tenant ${name}`, `kb-${name.toLowerCase()}-${tenantId.slice(0, 8)}`]);
    }
    const repository = createAiKnowledgeRepository(pool);
    const faqA = await repository.createFaq(tenantA, { question: 'Parking KLCC', answer: 'Parking at Level B2' });
    await repository.createFaq(tenantB, { question: 'Parking KLCC', answer: 'Different tenant secret parking' });
    const service = await pool.query(`INSERT INTO services(tenant_id,name,duration_minutes,price_minor,currency) VALUES($1,'Facial Premium',60,12000,'MYR') RETURNING id`, [tenantA]);

    const naturalQuestion = await repository.search(tenantA, 'Berapa harga untuk facial premium?', 8);
    assert.equal(naturalQuestion[0]?.id, `service:${service.rows[0].id}`);
    assert.match(naturalQuestion[0]?.content ?? '', /RM120\.00/);

    const tenantSafe = await repository.search(tenantA, 'Parking KLCC ada?', 8);
    assert.ok(tenantSafe.some(source => source.id === `faq:${faqA.id}`));
    assert.equal(tenantSafe.some(source => source.content.includes('secret parking')), false);

    const first = await repository.recordUnanswered(tenantA, 'Boleh bawa kucing?');
    const repeated = await repository.recordUnanswered(tenantA, 'Boleh bawa kucing?');
    assert.equal(repeated.id, first.id);
    assert.equal(repeated.occurrenceCount, 2);
    const taught = await repository.teachUnanswered(tenantA, first.id, { answer: 'Haiwan peliharaan tidak dibenarkan.' });
    assert.equal(taught?.unanswered.status, 'RESOLVED');
    const learned = await repository.search(tenantA, 'Boleh bawa kucing?', 8);
    assert.ok(learned.some(source => source.id === `faq:${taught?.faq.id}`));

    console.log(JSON.stringify({ status: 'PASS', naturalSource: naturalQuestion[0]?.id, tenantSafe: true, repeatCount: repeated.occurrenceCount, learnedFaq: taught?.faq.id }));
  } finally {
    await pool.query('DELETE FROM tenants WHERE id=ANY($1::uuid[])', [[tenantA, tenantB]]).catch(() => undefined);
    await pool.end();
  }
}

main().catch(error => { console.error(error); process.exit(1); });
