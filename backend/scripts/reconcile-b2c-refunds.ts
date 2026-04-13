import prisma from '../src/config/db';

interface Args { hours: number; limit: number; json: boolean; }
function parseArgs(): Args {
  const args = process.argv.slice(2);
  let hours = 24;
  let limit = 200;
  let json = false;
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--hours' && args[i+1]) hours = parseInt(args[++i], 10) || hours;
    else if (a === '--limit' && args[i+1]) limit = parseInt(args[++i], 10) || limit;
    else if (a === '--json') json = true;
  }
  return { hours, limit, json };
}

(async () => {
  const { hours, limit, json } = parseArgs();
  const since = new Date(Date.now() - hours * 3600 * 1000);

  const payments = await prisma.payment.findMany({
    where: {
      status: { in: ['REFUNDED', 'PARTIALLY_REFUNDED'] },
      updatedAt: { gte: since },
    },
    orderBy: { updatedAt: 'desc' },
    take: limit,
  });

  const rows: any[] = [];
  let totalOriginal = 0;
  let totalRefunded = 0;
  let anomalies = 0;

  for (const p of payments) {
    const meta: any = p.metadata || {};
    const original = Number(p.amount);
    const refunded = Number(p.refundAmount || 0);
    totalOriginal += original;
    totalRefunded += refunded;

    const issues: string[] = [];
    if (!meta.b2cRefundRequest) issues.push('NO_B2C_META');
    if (p.status === 'REFUNDED' && !p.providerRef) issues.push('NO_PROVIDER_REF');
    if (refunded > original) issues.push('OVER_REFUNDED');
    if (!meta.phone) issues.push('MISSING_PHONE');

    // If optimistically refunded but no b2c metadata older than 15m
    if (meta.b2cOptimistic && !meta.b2cRefundRequest) {
      const updatedAgeMin = (Date.now() - new Date(p.updatedAt).getTime()) / 60000;
      if (updatedAgeMin > 15) issues.push('NO_CALLBACK_META_>15M');
    }

    if (issues.length) anomalies++;

    rows.push({
      id: p.id,
      status: p.status,
      original,
      refunded,
      percent: refunded ? (refunded / original * 100).toFixed(1) + '%' : '0%',
      providerRef: p.providerRef || null,
      lastRefundAt: meta.lastRefundAt || null,
      hasB2CReq: Boolean(meta.b2cRefundRequest),
      issues,
    });
  }

  const summary = {
    windowHours: hours,
    examined: payments.length,
    anomalies,
    totalOriginal,
    totalRefunded,
    refundRatio: totalOriginal ? (totalRefunded / totalOriginal * 100).toFixed(2) + '%' : '0%',
  };

  if (json) {
    console.log(JSON.stringify({ summary, rows }, null, 2));
  } else {
    console.log('Refund Reconciliation Summary');
    console.log('--------------------------------');
    console.log(`Window (hrs):      ${hours}`);
    console.log(`Payments examined: ${payments.length}`);
    console.log(`Anomalies:         ${anomalies}`);
    console.log(`Total Original:    ${totalOriginal}`);
    console.log(`Total Refunded:    ${totalRefunded}`);
    console.log(`Refund Ratio:      ${summary.refundRatio}`);
    console.log('\nPotential Issues:');
    rows.filter(r => r.issues.length).forEach(r => {
      console.log(`- ${r.id} [${r.status}] ${r.issues.join(', ')} (refunded ${r.refunded}/${r.original})`);
    });
    if (!rows.some(r => r.issues.length)) console.log('None detected.');
  }

  await prisma.$disconnect();
})().catch(e => {
  console.error('Reconciliation script failed', e);
  process.exit(1);
});
