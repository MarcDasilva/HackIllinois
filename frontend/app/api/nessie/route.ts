import { NextRequest, NextResponse } from "next/server";

const NESSIE_BASE = "http://api.nessieisreal.com";
const API_KEY = process.env.NESSIE_API_KEY ?? "";

// ── POST: create customer, then create a checking account for them ─────────────
export async function POST(req: NextRequest) {
  if (!API_KEY) {
    return NextResponse.json({ error: "NESSIE_API_KEY not configured" }, { status: 500 });
  }

  const body = await req.json();
  const { action } = body;

  // Create a new Nessie customer
  if (action === "createCustomer") {
    const { first_name, last_name, address } = body;
    if (!first_name || !last_name || !address) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    try {
      const customerRes = await fetch(`${NESSIE_BASE}/customers?key=${API_KEY}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ first_name, last_name, address }),
      });

      if (!customerRes.ok) {
        const text = await customerRes.text();
        return NextResponse.json(
          { error: `Nessie create customer failed: ${customerRes.status}`, detail: text },
          { status: customerRes.status }
        );
      }

      const result = await customerRes.json();
      // Nessie returns { "objectCreated": { "_id": "...", ... } }
      const customerId = result?.objectCreated?._id ?? result?._id;
      return NextResponse.json({ customerId, raw: result });
    } catch {
      return NextResponse.json({ error: "Failed to reach Nessie API" }, { status: 502 });
    }
  }

  // Create a new account for an existing customer
  if (action === "createAccount") {
    const { customerId, type, nickname, balance, rewards } = body;
    if (!customerId) {
      return NextResponse.json({ error: "Missing customerId" }, { status: 400 });
    }

    try {
      const accountRes = await fetch(
        `${NESSIE_BASE}/customers/${customerId}/accounts?key=${API_KEY}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            type: type ?? "Checking",
            nickname: nickname ?? "Primary Checking",
            balance: balance ?? 0,
            rewards: rewards ?? 0,
          }),
        }
      );

      if (!accountRes.ok) {
        const text = await accountRes.text();
        return NextResponse.json(
          { error: `Nessie create account failed: ${accountRes.status}`, detail: text },
          { status: accountRes.status }
        );
      }

      const result = await accountRes.json();
      const accountId = result?.objectCreated?._id ?? result?._id;
      return NextResponse.json({ accountId, raw: result });
    } catch {
      return NextResponse.json({ error: "Failed to reach Nessie API" }, { status: 502 });
    }
  }

  // Create a deposit into an account
  if (action === "createDeposit") {
    const { accountId, amount, description, medium } = body;
    if (!accountId || !amount) {
      return NextResponse.json({ error: "Missing accountId or amount" }, { status: 400 });
    }

    try {
      const res = await fetch(
        `${NESSIE_BASE}/accounts/${accountId}/deposits?key=${API_KEY}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            medium: medium ?? "balance",
            transaction_date: new Date().toISOString().slice(0, 10),
            amount: parseFloat(amount),
            description: description ?? "Automated deposit",
          }),
        }
      );

      if (!res.ok) {
        const text = await res.text();
        return NextResponse.json(
          { error: `Nessie deposit failed: ${res.status}`, detail: text },
          { status: res.status }
        );
      }

      const result = await res.json();
      const depositId = result?.objectCreated?._id ?? result?._id;
      return NextResponse.json({ depositId, raw: result });
    } catch {
      return NextResponse.json({ error: "Failed to reach Nessie API" }, { status: 502 });
    }
  }

  // Create a withdrawal from an account
  if (action === "createWithdrawal") {
    const { accountId, amount, description, medium } = body;
    if (!accountId || !amount) {
      return NextResponse.json({ error: "Missing accountId or amount" }, { status: 400 });
    }

    try {
      const res = await fetch(
        `${NESSIE_BASE}/accounts/${accountId}/withdrawals?key=${API_KEY}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            medium: medium ?? "balance",
            transaction_date: new Date().toISOString().slice(0, 10),
            amount: parseFloat(amount),
            description: description ?? "Automated withdrawal",
          }),
        }
      );

      if (!res.ok) {
        const text = await res.text();
        return NextResponse.json(
          { error: `Nessie withdrawal failed: ${res.status}`, detail: text },
          { status: res.status }
        );
      }

      const result = await res.json();
      const withdrawalId = result?.objectCreated?._id ?? result?._id;
      return NextResponse.json({ withdrawalId, raw: result });
    } catch {
      return NextResponse.json({ error: "Failed to reach Nessie API" }, { status: 502 });
    }
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const customerId = searchParams.get("customerId");
  const accountId = searchParams.get("accountId"); // optional: fetch transactions for one account

  if (!API_KEY) {
    return NextResponse.json({ error: "NESSIE_API_KEY not configured" }, { status: 500 });
  }

  // ── Transactions for a single account ──────────────────────────────────────
  if (accountId) {
    try {
      const [purchasesRes, transfersRes, depositsRes, withdrawalsRes, loansRes] =
        await Promise.all([
          fetch(`${NESSIE_BASE}/accounts/${accountId}/purchases?key=${API_KEY}`),
          fetch(`${NESSIE_BASE}/accounts/${accountId}/transfers?key=${API_KEY}`),
          fetch(`${NESSIE_BASE}/accounts/${accountId}/deposits?key=${API_KEY}`),
          fetch(`${NESSIE_BASE}/accounts/${accountId}/withdrawals?key=${API_KEY}`),
          fetch(`${NESSIE_BASE}/accounts/${accountId}/loans?key=${API_KEY}`),
        ]);

      const safe = async (r: Response) => (r.ok ? r.json() : []);
      const [purchases, transfers, deposits, withdrawals, loans] = await Promise.all([
        safe(purchasesRes),
        safe(transfersRes),
        safe(depositsRes),
        safe(withdrawalsRes),
        safe(loansRes),
      ]);

      return NextResponse.json({ purchases, transfers, deposits, withdrawals, loans });
    } catch {
      return NextResponse.json({ error: "Failed to fetch transactions" }, { status: 502 });
    }
  }

  // ── Customer + accounts ────────────────────────────────────────────────────
  if (!customerId) {
    return NextResponse.json({ error: "Missing customerId or accountId" }, { status: 400 });
  }

  try {
    const [customerRes, accountsRes] = await Promise.all([
      fetch(`${NESSIE_BASE}/customers/${customerId}?key=${API_KEY}`),
      fetch(`${NESSIE_BASE}/customers/${customerId}/accounts?key=${API_KEY}`),
    ]);

    if (!customerRes.ok) {
      return NextResponse.json(
        { error: `Nessie customer fetch failed: ${customerRes.status}` },
        { status: customerRes.status }
      );
    }

    const customer = await customerRes.json();
    const accounts = accountsRes.ok ? await accountsRes.json() : [];

    return NextResponse.json({ customer, accounts });
  } catch {
    return NextResponse.json({ error: "Failed to reach Nessie API" }, { status: 502 });
  }
}
