"use client";

import { useEffect, useState, useRef } from "react";
import { useAuth } from "@/lib/auth/auth-provider";
import { AppSidebar } from "@/components/dashboard/app-sidebar";
import { SiteHeader } from "@/components/dashboard/site-header";
import { SidebarProvider, useSidebar } from "@/components/ui/sidebar";
import {
  IconBuildingBank,
  IconPlus,
  IconTrash,
  IconRefresh,
  IconCheck,
  IconX,
  IconAlertTriangle,
  IconUser,
  IconCreditCard,
  IconChevronDown,
  IconChevronUp,
  IconSparkles,
  IconCalendarEvent,
  IconArrowDownLeft,
  IconArrowUpRight,
  IconPlayerPlay,
  IconPlayerStop,
  IconClock,
  IconCircleCheck,
  IconCircleX,
  IconDots,
} from "@tabler/icons-react";

// ─── Constants ────────────────────────────────────────────────────────────────

const SIDEBAR_WIDTH = "calc(var(--spacing) * 72)";
const STORAGE_KEY = "velum_bank_profiles";
const EVENTS_STORAGE_KEY = "velum_bank_events";

// ─── Types ────────────────────────────────────────────────────────────────────

interface NessieAccount {
  _id: string;
  type: string;
  nickname: string;
  balance: number;
  rewards: number;
}

interface BankProfile {
  id: string;
  name: string;
  customerId: string;
  firstName: string;
  lastName: string;
  address: {
    street_number: string;
    street_name: string;
    city: string;
    state: string;
    zip: string;
  };
  accounts: NessieAccount[];
  createdAt: string;
}

type EventType = "deposit" | "withdrawal";
type RepeatInterval = "once" | "daily" | "weekly" | "monthly";
type EventStatus = "idle" | "running" | "completed" | "error";

interface EventRun {
  timestamp: string;
  success: boolean;
  message: string;
}

interface BankEvent {
  id: string;
  name: string;
  /** Profile this event is tied to */
  profileId: string;
  profileName: string;
  /** Account within that profile */
  accountId: string;
  accountNickname: string;
  type: EventType;
  amount: number;
  description: string;
  medium: "balance" | "rewards";
  repeat: RepeatInterval;
  /** ISO string — when to first/next fire */
  nextRunAt: string | null;
  createdAt: string;
  status: EventStatus;
  runs: EventRun[];
  active: boolean;
}

// ─── Autofill data pool ───────────────────────────────────────────────────────

const FIRST_NAMES = ["James", "Maria", "Lena", "Carlos", "Priya", "Tyler", "Amara", "Jordan"];
const LAST_NAMES = ["Smith", "Nguyen", "Patel", "Kim", "Rivera", "Johnson", "Chen", "Williams"];
const STREETS = [
  { number: "123", name: "Main St" },
  { number: "456", name: "Oak Ave" },
  { number: "789", name: "Maple Blvd" },
  { number: "321", name: "Cedar Ln" },
  { number: "654", name: "Pine Rd" },
];
const CITIES = [
  { city: "Chicago", state: "IL", zip: "60601" },
  { city: "Austin", state: "TX", zip: "78701" },
  { city: "Seattle", state: "WA", zip: "98101" },
  { city: "Miami", state: "FL", zip: "33101" },
  { city: "Denver", state: "CO", zip: "80201" },
];

function randomFrom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function generateAutofill() {
  const first = randomFrom(FIRST_NAMES);
  const last = randomFrom(LAST_NAMES);
  const street = randomFrom(STREETS);
  const loc = randomFrom(CITIES);
  return {
    profileName: `${first}'s Account`,
    firstName: first,
    lastName: last,
    streetNumber: street.number,
    streetName: street.name,
    city: loc.city,
    state: loc.state,
    zip: loc.zip,
    accountNickname: "Primary Checking",
    accountType: "Checking",
    balance: String(Math.floor(Math.random() * 45000) + 5000),
  };
}

// ─── Storage helpers ──────────────────────────────────────────────────────────

function readProfiles(): BankProfile[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]");
  } catch {
    return [];
  }
}

function writeProfiles(profiles: BankProfile[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(profiles));
}

function readEvents(): BankEvent[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(EVENTS_STORAGE_KEY) ?? "[]");
  } catch {
    return [];
  }
}

function writeEvents(events: BankEvent[]) {
  localStorage.setItem(EVENTS_STORAGE_KEY, JSON.stringify(events));
}

// ─── Next-run calculator ──────────────────────────────────────────────────────

function computeNextRun(from: Date, repeat: RepeatInterval): Date | null {
  if (repeat === "once") return null;
  const d = new Date(from);
  if (repeat === "daily") d.setDate(d.getDate() + 1);
  if (repeat === "weekly") d.setDate(d.getDate() + 7);
  if (repeat === "monthly") d.setMonth(d.getMonth() + 1);
  return d;
}

// ─── Nessie fetch helpers ─────────────────────────────────────────────────────

async function fetchNessieProfile(
  customerId: string
): Promise<{ customer: Record<string, unknown>; accounts: NessieAccount[] } | null> {
  try {
    const res = await fetch(`/api/nessie?customerId=${encodeURIComponent(customerId)}`);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

async function executeNessieEvent(
  event: BankEvent
): Promise<{ success: boolean; message: string }> {
  try {
    const action = event.type === "deposit" ? "createDeposit" : "createWithdrawal";
    const res = await fetch("/api/nessie", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action,
        accountId: event.accountId,
        amount: event.amount,
        description: event.description,
        medium: event.medium,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      return { success: false, message: data.detail ?? data.error ?? "Nessie API error" };
    }
    const idKey = event.type === "deposit" ? "depositId" : "withdrawalId";
    return {
      success: true,
      message: `${event.type === "deposit" ? "Deposit" : "Withdrawal"} of $${event.amount.toLocaleString()} completed (ID: ${data[idKey] ?? "—"})`,
    };
  } catch {
    return { success: false, message: "Network error — could not reach Nessie API." };
  }
}

// ─── Layout ───────────────────────────────────────────────────────────────────

function PageLayout({ children }: { children: React.ReactNode }) {
  const { open } = useSidebar();
  return (
    <div
      className="flex flex-col flex-1 min-h-svh transition-[margin-left] duration-200 ease-linear"
      style={{ marginLeft: open ? SIDEBAR_WIDTH : "0px" }}
    >
      {children}
    </div>
  );
}

// ─── Profile card ─────────────────────────────────────────────────────────────

function ProfileCard({
  profile,
  onDelete,
  onRefresh,
}: {
  profile: BankProfile;
  onDelete: () => void;
  onRefresh: (p: BankProfile) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  async function handleRefresh() {
    setRefreshing(true);
    const data = await fetchNessieProfile(profile.customerId);
    const updated: BankProfile = {
      ...profile,
      firstName: (data?.customer as { first_name?: string })?.first_name ?? profile.firstName,
      lastName: (data?.customer as { last_name?: string })?.last_name ?? profile.lastName,
      address: (data?.customer as { address?: BankProfile["address"] })?.address ?? profile.address,
      accounts: data?.accounts ?? profile.accounts,
    };
    onRefresh(updated);
    setRefreshing(false);
  }

  return (
    <div
      className="rounded-xl border border-zinc-800 overflow-hidden"
      style={{ background: "#0a0a0a" }}
    >
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3.5">
        <div
          className="rounded-lg p-2 shrink-0"
          style={{ background: "rgba(16,185,129,0.12)" }}
        >
          <IconBuildingBank size={16} style={{ color: "#10b981" }} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-medium text-white text-sm">{profile.name}</p>
          <p className="text-xs text-zinc-500 mt-0.5">
            {profile.firstName} {profile.lastName}
            <span className="font-mono ml-2 text-zinc-600">{profile.customerId}</span>
          </p>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="rounded-lg p-1.5 text-zinc-500 hover:text-white hover:bg-zinc-800 transition-colors"
            title="Refresh from Nessie"
          >
            <IconRefresh size={14} className={refreshing ? "animate-spin" : ""} />
          </button>
          <button
            onClick={() => setExpanded((v) => !v)}
            className="rounded-lg p-1.5 text-zinc-500 hover:text-white hover:bg-zinc-800 transition-colors"
          >
            {expanded ? <IconChevronUp size={14} /> : <IconChevronDown size={14} />}
          </button>
          <button
            onClick={onDelete}
            className="rounded-lg p-1.5 text-zinc-600 hover:text-red-400 hover:bg-zinc-800 transition-colors"
            title="Delete profile"
          >
            <IconTrash size={14} />
          </button>
        </div>
      </div>

      {/* Expanded details */}
      {expanded && (
        <div
          className="border-t px-4 py-3 flex flex-col gap-3"
          style={{ borderColor: "rgba(255,255,255,0.06)" }}
        >
          {/* Address */}
          {profile.address.city && (
            <div>
              <p className="text-xs text-zinc-500 mb-1">Address</p>
              <p className="text-xs text-zinc-300">
                {profile.address.street_number} {profile.address.street_name},{" "}
                {profile.address.city}, {profile.address.state}{" "}
                {profile.address.zip}
              </p>
            </div>
          )}

          {/* Accounts */}
          {profile.accounts.length > 0 && (
            <div>
              <p className="text-xs text-zinc-500 mb-2">Accounts</p>
              <div className="flex flex-col gap-1.5">
                {profile.accounts.map((acct) => (
                  <div
                    key={acct._id}
                    className="flex items-center justify-between rounded-lg px-3 py-2"
                    style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}
                  >
                    <div className="flex items-center gap-2">
                      <IconCreditCard size={12} className="text-zinc-500" />
                      <span className="text-xs text-zinc-300">
                        {acct.nickname || acct.type}
                      </span>
                      <span className="text-xs text-zinc-600 capitalize">
                        {acct.type}
                      </span>
                    </div>
                    <span className="text-xs font-medium text-emerald-400">
                      ${acct.balance.toLocaleString()}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {profile.accounts.length === 0 && (
            <p className="text-xs text-zinc-600">No accounts found.</p>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Input field helper ───────────────────────────────────────────────────────

function Field({
  label,
  value,
  onChange,
  placeholder,
  mono,
  half,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  mono?: boolean;
  half?: boolean;
}) {
  return (
    <div className={half ? "flex-1 min-w-0" : "w-full"}>
      <label className="text-xs text-zinc-400 mb-1 block">{label}</label>
      <input
        className={`w-full rounded-lg border px-3 py-2 text-sm text-white bg-zinc-900 border-zinc-700 placeholder-zinc-600 focus:outline-none focus:border-zinc-500 ${mono ? "font-mono" : ""}`}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

// ─── Add profile modal ────────────────────────────────────────────────────────

type ModalTab = "create" | "lookup";

function AddProfileModal({
  onClose,
  onAdd,
}: {
  onClose: () => void;
  onAdd: (p: BankProfile) => void;
}) {
  const [tab, setTab] = useState<ModalTab>("create");

  // Shared
  const [profileName, setProfileName] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");

  // Create fields
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [streetNumber, setStreetNumber] = useState("");
  const [streetName, setStreetName] = useState("");
  const [city, setCity] = useState("");
  const [stateVal, setStateVal] = useState("");
  const [zip, setZip] = useState("");
  const [accountNickname, setAccountNickname] = useState("Primary Checking");
  const [accountType, setAccountType] = useState("Checking");
  const [balance, setBalance] = useState("10000");

  // Lookup field
  const [customerId, setCustomerId] = useState("");

  function handleAutofill() {
    const data = generateAutofill();
    setProfileName(data.profileName);
    setFirstName(data.firstName);
    setLastName(data.lastName);
    setStreetNumber(data.streetNumber);
    setStreetName(data.streetName);
    setCity(data.city);
    setStateVal(data.state);
    setZip(data.zip);
    setAccountNickname(data.accountNickname);
    setAccountType(data.accountType);
    setBalance(data.balance);
  }

  async function handleCreate() {
    if (!profileName.trim() || !firstName.trim() || !lastName.trim()) return;
    setStatus("loading");
    setErrorMsg("");

    try {
      // 1. Create customer
      const customerRes = await fetch("/api/nessie", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "createCustomer",
          first_name: firstName.trim(),
          last_name: lastName.trim(),
          address: {
            street_number: streetNumber.trim(),
            street_name: streetName.trim(),
            city: city.trim(),
            state: stateVal.trim(),
            zip: zip.trim(),
          },
        }),
      });

      const customerData = await customerRes.json();
      if (!customerRes.ok) {
        setErrorMsg(customerData.detail ?? customerData.error ?? "Failed to create customer.");
        setStatus("error");
        return;
      }

      const newCustomerId: string = customerData.customerId;

      // 2. Create account
      await fetch("/api/nessie", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "createAccount",
          customerId: newCustomerId,
          type: accountType,
          nickname: accountNickname.trim(),
          balance: parseFloat(balance) || 0,
          rewards: 0,
        }),
      });

      // 3. Fetch the full profile back (includes the newly created account)
      const profileData = await fetchNessieProfile(newCustomerId);
      const c = profileData?.customer as {
        first_name?: string;
        last_name?: string;
        address?: BankProfile["address"];
      } | undefined;

      const profile: BankProfile = {
        id: crypto.randomUUID(),
        name: profileName.trim(),
        customerId: newCustomerId,
        firstName: c?.first_name ?? firstName,
        lastName: c?.last_name ?? lastName,
        address: c?.address ?? {
          street_number: streetNumber,
          street_name: streetName,
          city,
          state: stateVal,
          zip,
        },
        accounts: profileData?.accounts ?? [],
        createdAt: new Date().toISOString(),
      };

      onAdd(profile);
      onClose();
    } catch {
      setErrorMsg("Network error — could not reach Nessie API.");
      setStatus("error");
    } finally {
      setStatus("idle");
    }
  }

  async function handleLookup() {
    if (!profileName.trim() || !customerId.trim()) return;
    setStatus("loading");
    setErrorMsg("");

    const data = await fetchNessieProfile(customerId.trim());

    if (!data) {
      setErrorMsg("Customer not found or Nessie API is unreachable.");
      setStatus("error");
      return;
    }

    const c = data.customer as {
      first_name?: string;
      last_name?: string;
      address?: BankProfile["address"];
    };

    const profile: BankProfile = {
      id: crypto.randomUUID(),
      name: profileName.trim(),
      customerId: customerId.trim(),
      firstName: c.first_name ?? "",
      lastName: c.last_name ?? "",
      address: c.address ?? { street_number: "", street_name: "", city: "", state: "", zip: "" },
      accounts: data.accounts,
      createdAt: new Date().toISOString(),
    };

    onAdd(profile);
    onClose();
  }

  const createDisabled =
    status === "loading" ||
    !profileName.trim() ||
    !firstName.trim() ||
    !lastName.trim() ||
    !streetNumber.trim() ||
    !streetName.trim() ||
    !city.trim() ||
    !stateVal.trim() ||
    !zip.trim();

  const lookupDisabled = status === "loading" || !profileName.trim() || !customerId.trim();

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: "rgba(0,0,0,0.8)" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="rounded-xl border border-zinc-800 w-full max-w-lg shadow-2xl flex flex-col"
        style={{ background: "#0a0a0a", maxHeight: "90vh" }}
      >
        {/* Modal header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-4 shrink-0">
          <div>
            <h3 className="text-base font-semibold text-white">Add Bank Profile</h3>
            <p className="text-xs text-zinc-500 mt-0.5">
              Create a new Nessie customer or look up an existing one.
            </p>
          </div>
          <button onClick={onClose} className="text-zinc-500 hover:text-white transition-colors">
            <IconX size={16} />
          </button>
        </div>

        {/* Tabs */}
        <div
          className="flex mx-5 mb-4 rounded-lg overflow-hidden shrink-0 p-0.5"
          style={{ border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.03)" }}
        >
          {(["create", "lookup"] as ModalTab[]).map((t) => (
            <button
              key={t}
              onClick={() => { setTab(t); setErrorMsg(""); setStatus("idle"); }}
              className="flex-1 py-1.5 text-xs font-medium transition-colors rounded-md"
              style={{
                background: tab === t ? "rgba(255,255,255,0.09)" : "transparent",
                color: tab === t ? "#fff" : "#71717a",
              }}
            >
              {t === "create" ? "Create New Customer" : "Lookup by Customer ID"}
            </button>
          ))}
        </div>

        {/* Scrollable body */}
        <div className="overflow-y-auto px-5 pb-5 flex-1">
          {/* Shared: profile name */}
          <div className="mb-4">
            <Field
              label="Profile Name"
              value={profileName}
              onChange={setProfileName}
              placeholder="e.g. John's Account"
            />
          </div>

          {/* ── Create tab ──────────────────────────────────────────── */}
          {tab === "create" && (
            <div className="flex flex-col gap-3">
              {/* Autofill banner */}
              <div
                className="flex items-center justify-between rounded-lg px-3 py-2.5"
                style={{ background: "rgba(184,160,96,0.08)", border: "1px solid rgba(184,160,96,0.2)" }}
              >
                <div>
                  <p className="text-xs font-medium" style={{ color: "#b8a060" }}>Autofill</p>
                  <p className="text-xs text-zinc-500 mt-0.5">Fill all fields with randomized sample data.</p>
                </div>
                <button
                  onClick={handleAutofill}
                  className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors shrink-0"
                  style={{ background: "rgba(184,160,96,0.15)", color: "#b8a060", border: "1px solid rgba(184,160,96,0.3)" }}
                >
                  <IconSparkles size={12} />
                  Autofill
                </button>
              </div>

              {/* Name row */}
              <div className="flex gap-3">
                <Field label="First Name" value={firstName} onChange={setFirstName} placeholder="Jane" half />
                <Field label="Last Name" value={lastName} onChange={setLastName} placeholder="Doe" half />
              </div>

              <p className="text-xs font-medium text-zinc-400 mt-1">Address</p>

              {/* Street */}
              <div className="flex gap-3">
                <div style={{ width: "28%" }}>
                  <Field label="Street #" value={streetNumber} onChange={setStreetNumber} placeholder="123" />
                </div>
                <div className="flex-1">
                  <Field label="Street Name" value={streetName} onChange={setStreetName} placeholder="Main St" />
                </div>
              </div>

              {/* City / State / ZIP */}
              <div className="flex gap-3">
                <Field label="City" value={city} onChange={setCity} placeholder="Chicago" half />
                <div style={{ width: "18%" }}>
                  <Field label="State" value={stateVal} onChange={setStateVal} placeholder="IL" />
                </div>
                <div style={{ width: "24%" }}>
                  <Field label="ZIP" value={zip} onChange={setZip} placeholder="60601" />
                </div>
              </div>

              <p className="text-xs font-medium text-zinc-400 mt-1">Initial Account</p>

              {/* Account type + nickname */}
              <div className="flex gap-3">
                <div className="flex-1">
                  <label className="text-xs text-zinc-400 mb-1 block">Type</label>
                  <select
                    className="w-full rounded-lg border px-3 py-2 text-sm text-white bg-zinc-900 border-zinc-700 focus:outline-none focus:border-zinc-500"
                    value={accountType}
                    onChange={(e) => setAccountType(e.target.value)}
                  >
                    <option value="Checking">Checking</option>
                    <option value="Savings">Savings</option>
                    <option value="Credit Card">Credit Card</option>
                  </select>
                </div>
                <Field label="Nickname" value={accountNickname} onChange={setAccountNickname} placeholder="Primary Checking" half />
              </div>

              <Field label="Starting Balance ($)" value={balance} onChange={setBalance} placeholder="10000" />
            </div>
          )}

          {/* ── Lookup tab ──────────────────────────────────────────── */}
          {tab === "lookup" && (
            <div className="flex flex-col gap-3">
              <div
                className="rounded-lg px-3 py-2.5 text-xs text-zinc-400"
                style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}
              >
                Enter a Nessie customer ID to fetch their info and accounts.
              </div>
              <Field
                label="Customer ID"
                value={customerId}
                onChange={setCustomerId}
                placeholder="5f8a2b..."
                mono
              />
            </div>
          )}

          {/* Error */}
          {errorMsg && (
            <div
              className="flex items-start gap-2 rounded-lg px-3 py-2 mt-4 text-xs text-amber-400"
              style={{ background: "rgba(251,191,36,0.08)", border: "1px solid rgba(251,191,36,0.2)" }}
            >
              <IconAlertTriangle size={13} className="mt-0.5 shrink-0" />
              {errorMsg}
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-2 justify-end mt-5">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-lg text-sm text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={tab === "create" ? handleCreate : handleLookup}
              disabled={tab === "create" ? createDisabled : lookupDisabled}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white transition-colors disabled:opacity-40"
              style={{ background: "#10b981" }}
            >
              {status === "loading" ? (
                <IconRefresh size={14} className="animate-spin" />
              ) : (
                <IconCheck size={14} />
              )}
              {status === "loading"
                ? tab === "create" ? "Creating…" : "Looking up…"
                : tab === "create" ? "Create & Add" : "Add Profile"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Add Event Modal ──────────────────────────────────────────────────────────

function AddEventModal({
  profiles,
  onClose,
  onAdd,
}: {
  profiles: BankProfile[];
  onClose: () => void;
  onAdd: (e: BankEvent) => void;
}) {
  const [eventName, setEventName] = useState("");
  const [selectedProfileId, setSelectedProfileId] = useState(profiles[0]?.id ?? "");
  const [selectedAccountId, setSelectedAccountId] = useState("");
  const [eventType, setEventType] = useState<EventType>("deposit");
  const [amount, setAmount] = useState("500");
  const [description, setDescription] = useState("");
  const [medium, setMedium] = useState<"balance" | "rewards">("balance");
  const [repeat, setRepeat] = useState<RepeatInterval>("once");
  const [runNow, setRunNow] = useState(true);
  const [errorMsg, setErrorMsg] = useState("");

  const selectedProfile = profiles.find((p) => p.id === selectedProfileId);
  const accounts = selectedProfile?.accounts ?? [];

  // When profile changes reset account
  useEffect(() => {
    setSelectedAccountId(accounts[0]?._id ?? "");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedProfileId]);

  // Init account on mount
  useEffect(() => {
    setSelectedAccountId(accounts[0]?._id ?? "");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selectedAccount = accounts.find((a) => a._id === selectedAccountId);

  const isValid =
    eventName.trim() &&
    selectedProfileId &&
    selectedAccountId &&
    parseFloat(amount) > 0;

  function handleAdd() {
    if (!isValid) return;
    setErrorMsg("");

    if (!selectedProfile || !selectedAccount) {
      setErrorMsg("Please select a valid profile and account.");
      return;
    }

    const now = new Date();
    const event: BankEvent = {
      id: crypto.randomUUID(),
      name: eventName.trim(),
      profileId: selectedProfileId,
      profileName: selectedProfile.name,
      accountId: selectedAccountId,
      accountNickname: selectedAccount.nickname || selectedAccount.type,
      type: eventType,
      amount: parseFloat(amount),
      description: description.trim() || `Automated ${eventType}`,
      medium,
      repeat,
      nextRunAt: runNow ? now.toISOString() : null,
      createdAt: now.toISOString(),
      status: "idle",
      runs: [],
      active: true,
    };

    onAdd(event);
    onClose();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: "rgba(0,0,0,0.8)" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="rounded-xl border border-zinc-800 w-full max-w-lg shadow-2xl flex flex-col"
        style={{ background: "#0a0a0a", maxHeight: "92vh" }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-4 shrink-0">
          <div>
            <h3 className="text-base font-semibold text-white">New Bank Event</h3>
            <p className="text-xs text-zinc-500 mt-0.5">
              Automate a deposit or withdrawal for a profile.
            </p>
          </div>
          <button onClick={onClose} className="text-zinc-500 hover:text-white transition-colors">
            <IconX size={16} />
          </button>
        </div>

        <div className="overflow-y-auto px-5 pb-5 flex-1 flex flex-col gap-4">

          {/* No profiles warning */}
          {profiles.length === 0 && (
            <div
              className="flex items-start gap-2 rounded-lg px-3 py-2.5 text-xs text-amber-400"
              style={{ background: "rgba(251,191,36,0.08)", border: "1px solid rgba(251,191,36,0.2)" }}
            >
              <IconAlertTriangle size={13} className="mt-0.5 shrink-0" />
              No bank profiles found. Create a profile first.
            </div>
          )}

          {/* Event name */}
          <Field
            label="Event Name"
            value={eventName}
            onChange={setEventName}
            placeholder="e.g. Monthly Savings Deposit"
          />

          {/* Source: profile */}
          <div>
            <label className="text-xs text-zinc-400 mb-1 block">Profile (source)</label>
            <select
              className="w-full rounded-lg border px-3 py-2 text-sm text-white bg-zinc-900 border-zinc-700 focus:outline-none focus:border-zinc-500"
              value={selectedProfileId}
              onChange={(e) => setSelectedProfileId(e.target.value)}
              disabled={profiles.length === 0}
            >
              {profiles.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} — {p.firstName} {p.lastName}
                </option>
              ))}
            </select>
            {selectedProfile && (
              <p className="text-xs text-zinc-600 mt-1 font-mono">
                Customer ID: {selectedProfile.customerId}
              </p>
            )}
          </div>

          {/* Account within profile */}
          <div>
            <label className="text-xs text-zinc-400 mb-1 block">Account</label>
            {accounts.length === 0 ? (
              <p className="text-xs text-zinc-600 py-2">No accounts on this profile.</p>
            ) : (
              <select
                className="w-full rounded-lg border px-3 py-2 text-sm text-white bg-zinc-900 border-zinc-700 focus:outline-none focus:border-zinc-500"
                value={selectedAccountId}
                onChange={(e) => setSelectedAccountId(e.target.value)}
              >
                {accounts.map((a) => (
                  <option key={a._id} value={a._id}>
                    {a.nickname || a.type} ({a.type}) — ${a.balance.toLocaleString()}
                  </option>
                ))}
              </select>
            )}
            {selectedAccount && (
              <p className="text-xs text-zinc-600 mt-1 font-mono">
                Account ID: {selectedAccount._id}
              </p>
            )}
          </div>

          {/* Event type */}
          <div>
            <label className="text-xs text-zinc-400 mb-1.5 block">Event Type</label>
            <div className="flex gap-2">
              {(["deposit", "withdrawal"] as EventType[]).map((t) => (
                <button
                  key={t}
                  onClick={() => setEventType(t)}
                  className="flex-1 flex items-center justify-center gap-2 rounded-lg py-2 text-xs font-medium transition-colors border"
                  style={{
                    background: eventType === t
                      ? t === "deposit" ? "rgba(16,185,129,0.15)" : "rgba(239,68,68,0.12)"
                      : "rgba(255,255,255,0.03)",
                    borderColor: eventType === t
                      ? t === "deposit" ? "rgba(16,185,129,0.4)" : "rgba(239,68,68,0.35)"
                      : "rgba(255,255,255,0.08)",
                    color: eventType === t
                      ? t === "deposit" ? "#10b981" : "#f87171"
                      : "#71717a",
                  }}
                >
                  {t === "deposit"
                    ? <IconArrowDownLeft size={13} />
                    : <IconArrowUpRight size={13} />}
                  {t.charAt(0).toUpperCase() + t.slice(1)}
                </button>
              ))}
            </div>
          </div>

          {/* Amount + medium */}
          <div className="flex gap-3">
            <Field
              label="Amount ($)"
              value={amount}
              onChange={setAmount}
              placeholder="500"
              half
            />
            <div className="flex-1 min-w-0">
              <label className="text-xs text-zinc-400 mb-1 block">Medium</label>
              <select
                className="w-full rounded-lg border px-3 py-2 text-sm text-white bg-zinc-900 border-zinc-700 focus:outline-none focus:border-zinc-500"
                value={medium}
                onChange={(e) => setMedium(e.target.value as "balance" | "rewards")}
              >
                <option value="balance">Balance</option>
                <option value="rewards">Rewards</option>
              </select>
            </div>
          </div>

          {/* Description */}
          <Field
            label="Description (optional)"
            value={description}
            onChange={setDescription}
            placeholder="e.g. Payroll, Rent payment…"
          />

          {/* Repeat */}
          <div>
            <label className="text-xs text-zinc-400 mb-1 block">Repeat</label>
            <select
              className="w-full rounded-lg border px-3 py-2 text-sm text-white bg-zinc-900 border-zinc-700 focus:outline-none focus:border-zinc-500"
              value={repeat}
              onChange={(e) => setRepeat(e.target.value as RepeatInterval)}
            >
              <option value="once">Once</option>
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
            </select>
          </div>

          {/* Run immediately toggle */}
          <label className="flex items-center gap-3 cursor-pointer select-none">
            <div
              onClick={() => setRunNow((v) => !v)}
              className="w-9 h-5 rounded-full transition-colors shrink-0 relative"
              style={{ background: runNow ? "#10b981" : "rgba(255,255,255,0.1)" }}
            >
              <div
                className="absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform"
                style={{ transform: runNow ? "translateX(18px)" : "translateX(2px)" }}
              />
            </div>
            <span className="text-xs text-zinc-400">Run immediately when saved</span>
          </label>

          {/* Error */}
          {errorMsg && (
            <div
              className="flex items-start gap-2 rounded-lg px-3 py-2 text-xs text-amber-400"
              style={{ background: "rgba(251,191,36,0.08)", border: "1px solid rgba(251,191,36,0.2)" }}
            >
              <IconAlertTriangle size={13} className="mt-0.5 shrink-0" />
              {errorMsg}
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-2 justify-end mt-1">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-lg text-sm text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleAdd}
              disabled={!isValid || profiles.length === 0}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white transition-colors disabled:opacity-40"
              style={{ background: "#10b981" }}
            >
              <IconCheck size={14} />
              Save Event
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Event Card ───────────────────────────────────────────────────────────────

function EventCard({
  event,
  onDelete,
  onToggleActive,
  onRunNow,
}: {
  event: BankEvent;
  onDelete: () => void;
  onToggleActive: () => void;
  onRunNow: () => void;
}) {
  const [expanded, setExpanded] = useState(false);

  const isDeposit = event.type === "deposit";
  const typeColor = isDeposit ? "#10b981" : "#f87171";
  const typeBg = isDeposit ? "rgba(16,185,129,0.12)" : "rgba(239,68,68,0.1)";

  const lastRun = event.runs[event.runs.length - 1];

  return (
    <div
      className="rounded-xl border overflow-hidden"
      style={{
        background: "#0a0a0a",
        borderColor: event.active ? "rgba(255,255,255,0.1)" : "rgba(255,255,255,0.05)",
        opacity: event.active ? 1 : 0.6,
      }}
    >
      {/* Header row */}
      <div className="flex items-center gap-3 px-4 py-3.5">
        {/* Type badge */}
        <div className="rounded-lg p-2 shrink-0" style={{ background: typeBg }}>
          {isDeposit
            ? <IconArrowDownLeft size={15} style={{ color: typeColor }} />
            : <IconArrowUpRight size={15} style={{ color: typeColor }} />}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="font-medium text-white text-sm truncate">{event.name}</p>
            {event.status === "running" && (
              <span className="text-xs px-1.5 py-0.5 rounded-md font-medium"
                style={{ background: "rgba(251,191,36,0.12)", color: "#fbbf24" }}>
                Running
              </span>
            )}
          </div>
          <p className="text-xs text-zinc-500 mt-0.5 truncate">
            <span style={{ color: typeColor }}>{isDeposit ? "Deposit" : "Withdrawal"}</span>
            {" "}
            <span className="font-medium text-zinc-300">${event.amount.toLocaleString()}</span>
            {" via "}
            <span className="text-zinc-400">{event.medium}</span>
            {" · "}
            <span className="text-zinc-500">{event.profileName}</span>
            {" / "}
            <span className="text-zinc-500">{event.accountNickname}</span>
          </p>
        </div>

        {/* Status dot */}
        <div className="flex items-center gap-1 shrink-0">
          {lastRun && (
            <div title={lastRun.message}>
              {lastRun.success
                ? <IconCircleCheck size={14} className="text-emerald-500" />
                : <IconCircleX size={14} className="text-red-400" />}
            </div>
          )}

          {/* Repeat pill */}
          <span
            className="text-xs px-1.5 py-0.5 rounded-md font-mono"
            style={{ background: "rgba(255,255,255,0.05)", color: "#71717a" }}
          >
            {event.repeat}
          </span>

          <button
            onClick={onRunNow}
            disabled={event.status === "running"}
            title="Run now"
            className="rounded-lg p-1.5 text-zinc-500 hover:text-emerald-400 hover:bg-zinc-800 transition-colors disabled:opacity-40"
          >
            <IconPlayerPlay size={13} />
          </button>

          <button
            onClick={onToggleActive}
            title={event.active ? "Pause" : "Resume"}
            className="rounded-lg p-1.5 text-zinc-500 hover:text-white hover:bg-zinc-800 transition-colors"
          >
            {event.active
              ? <IconPlayerStop size={13} />
              : <IconPlayerPlay size={13} className="text-emerald-500" />}
          </button>

          <button
            onClick={() => setExpanded((v) => !v)}
            className="rounded-lg p-1.5 text-zinc-500 hover:text-white hover:bg-zinc-800 transition-colors"
          >
            {expanded ? <IconChevronUp size={13} /> : <IconChevronDown size={13} />}
          </button>

          <button
            onClick={onDelete}
            className="rounded-lg p-1.5 text-zinc-600 hover:text-red-400 hover:bg-zinc-800 transition-colors"
            title="Delete event"
          >
            <IconTrash size={13} />
          </button>
        </div>
      </div>

      {/* Expanded details */}
      {expanded && (
        <div
          className="border-t px-4 py-3 flex flex-col gap-3"
          style={{ borderColor: "rgba(255,255,255,0.06)" }}
        >
          {/* Meta */}
          <div className="grid grid-cols-2 gap-x-4 gap-y-2">
            <div>
              <p className="text-xs text-zinc-600 mb-0.5">Profile</p>
              <p className="text-xs text-zinc-300">{event.profileName}</p>
              <p className="text-xs text-zinc-600 font-mono">{event.profileId}</p>
            </div>
            <div>
              <p className="text-xs text-zinc-600 mb-0.5">Account</p>
              <p className="text-xs text-zinc-300">{event.accountNickname}</p>
              <p className="text-xs text-zinc-600 font-mono">{event.accountId}</p>
            </div>
            <div>
              <p className="text-xs text-zinc-600 mb-0.5">Description</p>
              <p className="text-xs text-zinc-300">{event.description}</p>
            </div>
            <div>
              <p className="text-xs text-zinc-600 mb-0.5">Next run</p>
              <p className="text-xs text-zinc-300">
                {event.nextRunAt
                  ? new Date(event.nextRunAt).toLocaleString()
                  : event.repeat === "once" && event.runs.length > 0
                    ? "Completed"
                    : "Not scheduled"}
              </p>
            </div>
          </div>

          {/* Run history */}
          {event.runs.length > 0 && (
            <div>
              <p className="text-xs text-zinc-500 mb-2">Run history</p>
              <div className="flex flex-col gap-1.5 max-h-36 overflow-y-auto">
                {[...event.runs].reverse().map((run, i) => (
                  <div
                    key={i}
                    className="flex items-start gap-2 rounded-lg px-3 py-2"
                    style={{
                      background: run.success ? "rgba(16,185,129,0.06)" : "rgba(239,68,68,0.07)",
                      border: `1px solid ${run.success ? "rgba(16,185,129,0.15)" : "rgba(239,68,68,0.15)"}`,
                    }}
                  >
                    {run.success
                      ? <IconCircleCheck size={12} className="text-emerald-500 mt-0.5 shrink-0" />
                      : <IconCircleX size={12} className="text-red-400 mt-0.5 shrink-0" />}
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-zinc-300">{run.message}</p>
                      <p className="text-xs text-zinc-600 mt-0.5">
                        {new Date(run.timestamp).toLocaleString()}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {event.runs.length === 0 && (
            <p className="text-xs text-zinc-600">No runs yet.</p>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Bank Events Tab ──────────────────────────────────────────────────────────

function BankEventsTab({ profiles }: { profiles: BankProfile[] }) {
  const [events, setEvents] = useState<BankEvent[]>([]);
  const [addingEvent, setAddingEvent] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Load from storage
  useEffect(() => {
    setEvents(readEvents());
  }, []);

  // Scheduler tick — checks every 30 s if any event is due
  useEffect(() => {
    tickRef.current = setInterval(() => {
      setEvents((prev) => {
        let changed = false;
        const next = prev.map((ev) => {
          if (!ev.active || ev.status === "running" || !ev.nextRunAt) return ev;
          if (new Date(ev.nextRunAt) <= new Date()) {
            changed = true;
            // Fire async but keep the tick loop clean
            fireEvent(ev, (updated) => {
              setEvents((evs) => {
                const res = evs.map((e) => (e.id === updated.id ? updated : e));
                writeEvents(res);
                return res;
              });
            });
            return { ...ev, status: "running" as EventStatus };
          }
          return ev;
        });
        if (changed) writeEvents(next);
        return changed ? next : prev;
      });
    }, 30_000);

    return () => { if (tickRef.current) clearInterval(tickRef.current); };
  }, []);

  async function fireEvent(ev: BankEvent, onDone: (updated: BankEvent) => void) {
    const result = await executeNessieEvent(ev);
    const run: EventRun = {
      timestamp: new Date().toISOString(),
      success: result.success,
      message: result.message,
    };
    const nextRun = computeNextRun(new Date(), ev.repeat);
    const updated: BankEvent = {
      ...ev,
      status: result.success ? "completed" : "error",
      runs: [...ev.runs, run],
      nextRunAt: nextRun ? nextRun.toISOString() : null,
      // deactivate one-shot events after run
      active: ev.repeat !== "once" ? ev.active : false,
    };
    onDone(updated);
  }

  function handleAdd(ev: BankEvent) {
    const updated = [...events, ev];
    setEvents(updated);
    writeEvents(updated);

    // If "run now" was requested, fire immediately
    if (ev.nextRunAt && new Date(ev.nextRunAt) <= new Date()) {
      const withRunning = updated.map((e) => e.id === ev.id ? { ...e, status: "running" as EventStatus } : e);
      setEvents(withRunning);
      writeEvents(withRunning);
      fireEvent(ev, (done) => {
        setEvents((evs) => {
          const res = evs.map((e) => (e.id === done.id ? done : e));
          writeEvents(res);
          return res;
        });
      });
    }
  }

  function handleRunNow(ev: BankEvent) {
    const withRunning = events.map((e) =>
      e.id === ev.id ? { ...e, status: "running" as EventStatus } : e
    );
    setEvents(withRunning);
    writeEvents(withRunning);
    fireEvent(ev, (done) => {
      setEvents((evs) => {
        const res = evs.map((e) => (e.id === done.id ? done : e));
        writeEvents(res);
        return res;
      });
    });
  }

  function handleToggleActive(id: string) {
    const next = events.map((e) =>
      e.id === id ? { ...e, active: !e.active } : e
    );
    setEvents(next);
    writeEvents(next);
  }

  function handleDelete(id: string) {
    const next = events.filter((e) => e.id !== id);
    setEvents(next);
    writeEvents(next);
    setDeleteTarget(null);
  }

  const activeCount = events.filter((e) => e.active).length;
  const runCount = events.reduce((sum, e) => sum + e.runs.length, 0);

  return (
    <div className="flex flex-col gap-6">
      {/* Toolbar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div
            className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs"
            style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)" }}
          >
            <IconClock size={12} className="text-zinc-500" />
            <span className="text-zinc-400">{activeCount} active</span>
          </div>
          <div
            className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs"
            style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)" }}
          >
            <IconDots size={12} className="text-zinc-500" />
            <span className="text-zinc-400">{runCount} total runs</span>
          </div>
        </div>
        <button
          onClick={() => setAddingEvent(true)}
          className="flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-white transition-colors"
          style={{ background: "#10b981" }}
          onMouseEnter={(e) => (e.currentTarget.style.background = "#059669")}
          onMouseLeave={(e) => (e.currentTarget.style.background = "#10b981")}
        >
          <IconPlus size={15} />
          New Event
        </button>
      </div>

      {/* Modals */}
      {addingEvent && (
        <AddEventModal
          profiles={profiles}
          onClose={() => setAddingEvent(false)}
          onAdd={handleAdd}
        />
      )}

      {deleteTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center"
          style={{ background: "rgba(0,0,0,0.75)" }}
          onClick={(e) => { if (e.target === e.currentTarget) setDeleteTarget(null); }}
        >
          <div
            className="rounded-xl border border-zinc-800 p-6 w-full max-w-sm shadow-2xl"
            style={{ background: "#0a0a0a" }}
          >
            <h3 className="text-base font-semibold text-white mb-1">Delete event?</h3>
            <p className="text-sm text-zinc-500 mb-5">This will remove all run history too.</p>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setDeleteTarget(null)}
                className="px-4 py-2 rounded-lg text-sm text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDelete(deleteTarget)}
                className="px-4 py-2 rounded-lg text-sm font-medium bg-red-600 text-white hover:bg-red-500 transition-colors"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Empty state */}
      {events.length === 0 && (
        <div className="rounded-xl border border-dashed border-zinc-800 flex flex-col items-center justify-center py-20 text-center">
          <IconCalendarEvent size={38} className="text-zinc-700 mb-4" />
          <p className="text-white font-medium mb-1">No automated events yet</p>
          <p className="text-sm text-zinc-600 mb-6">
            Schedule deposits and withdrawals that run automatically on a timeline.
          </p>
          {profiles.length === 0 && (
            <p className="text-xs text-amber-500 mb-4">Create a bank profile first.</p>
          )}
          <button
            onClick={() => setAddingEvent(true)}
            disabled={profiles.length === 0}
            className="flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
            style={{ background: "#10b981" }}
          >
            <IconPlus size={15} />
            New Event
          </button>
        </div>
      )}

      {/* Event list */}
      {events.length > 0 && (
        <div className="flex flex-col gap-3">
          {events.map((ev) => (
            <EventCard
              key={ev.id}
              event={ev}
              onDelete={() => setDeleteTarget(ev.id)}
              onToggleActive={() => handleToggleActive(ev.id)}
              onRunNow={() => handleRunNow(ev)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Main page content ────────────────────────────────────────────────────────

type PageTab = "profiles" | "events";

function BankProfilesContent() {
  const [pageTab, setPageTab] = useState<PageTab>("profiles");
  const [profiles, setProfiles] = useState<BankProfile[]>([]);
  const [adding, setAdding] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

  useEffect(() => {
    setProfiles(readProfiles());
  }, []);

  function handleAdd(profile: BankProfile) {
    const updated = [...profiles, profile];
    setProfiles(updated);
    writeProfiles(updated);
  }

  function handleRefresh(updated: BankProfile) {
    const next = profiles.map((p) => (p.id === updated.id ? updated : p));
    setProfiles(next);
    writeProfiles(next);
  }

  function handleDelete(id: string) {
    const next = profiles.filter((p) => p.id !== id);
    setProfiles(next);
    writeProfiles(next);
    setDeleteTarget(null);
  }

  return (
    <div className="flex-1 p-8 max-w-3xl mx-auto w-full">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-semibold text-white">Bank Profiles</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Link Capital One Nessie API profiles to use in your workflows.
          </p>
        </div>
        {pageTab === "profiles" && (
          <button
            onClick={() => setAdding(true)}
            className="flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-white transition-colors"
            style={{ background: "#10b981" }}
            onMouseEnter={(e) => (e.currentTarget.style.background = "#059669")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "#10b981")}
          >
            <IconPlus size={15} />
            Add Profile
          </button>
        )}
      </div>

      {/* Page tabs */}
      <div
        className="flex mb-6 rounded-lg overflow-hidden p-0.5"
        style={{ border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.03)" }}
      >
        {([
          { key: "profiles", label: "Profiles", icon: <IconBuildingBank size={13} /> },
          { key: "events", label: "Bank Events", icon: <IconCalendarEvent size={13} /> },
        ] as { key: PageTab; label: string; icon: React.ReactNode }[]).map((t) => (
          <button
            key={t.key}
            onClick={() => setPageTab(t.key)}
            className="flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-medium transition-colors rounded-md"
            style={{
              background: pageTab === t.key ? "rgba(255,255,255,0.09)" : "transparent",
              color: pageTab === t.key ? "#fff" : "#71717a",
            }}
          >
            {t.icon}
            {t.label}
            {t.key === "profiles" && profiles.length > 0 && (
              <span
                className="ml-1 rounded-full px-1.5 py-px text-xs font-mono"
                style={{ background: "rgba(255,255,255,0.08)", color: "#71717a" }}
              >
                {profiles.length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ── Profiles tab ── */}
      {pageTab === "profiles" && (
        <>
          {/* Add modal */}
          {adding && (
            <AddProfileModal
              onClose={() => setAdding(false)}
              onAdd={handleAdd}
            />
          )}

          {/* Delete confirm */}
          {deleteTarget && (
            <div
              className="fixed inset-0 z-50 flex items-center justify-center"
              style={{ background: "rgba(0,0,0,0.75)" }}
              onClick={(e) => { if (e.target === e.currentTarget) setDeleteTarget(null); }}
            >
              <div
                className="rounded-xl border border-zinc-800 p-6 w-full max-w-sm shadow-2xl"
                style={{ background: "#0a0a0a" }}
              >
                <h3 className="text-base font-semibold text-white mb-1">Delete profile?</h3>
                <p className="text-sm text-zinc-500 mb-5">This cannot be undone.</p>
                <div className="flex gap-2 justify-end">
                  <button
                    onClick={() => setDeleteTarget(null)}
                    className="px-4 py-2 rounded-lg text-sm text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => handleDelete(deleteTarget)}
                    className="px-4 py-2 rounded-lg text-sm font-medium bg-red-600 text-white hover:bg-red-500 transition-colors"
                  >
                    Delete
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Empty state */}
          {profiles.length === 0 && (
            <div className="rounded-xl border border-dashed border-zinc-800 flex flex-col items-center justify-center py-20 text-center">
              <IconUser size={38} className="text-zinc-700 mb-4" />
              <p className="text-white font-medium mb-1">No bank profiles yet</p>
              <p className="text-sm text-zinc-600 mb-6">
                Create a new customer or look up an existing one.
              </p>
              <button
                onClick={() => setAdding(true)}
                className="flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-white"
                style={{ background: "#10b981" }}
              >
                <IconPlus size={15} />
                Add Profile
              </button>
            </div>
          )}

          {/* Profile list */}
          {profiles.length > 0 && (
            <div className="flex flex-col gap-3">
              {profiles.map((p) => (
                <ProfileCard
                  key={p.id}
                  profile={p}
                  onDelete={() => setDeleteTarget(p.id)}
                  onRefresh={handleRefresh}
                />
              ))}
            </div>
          )}
        </>
      )}

      {/* ── Bank Events tab ── */}
      {pageTab === "events" && (
        <BankEventsTab profiles={profiles} />
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function BankProfilesPage() {
  const { user, signOut } = useAuth();
  const displayUser = {
    name: user?.user_metadata?.full_name ?? user?.email ?? "User",
    email: user?.email ?? "",
    avatar: user?.user_metadata?.avatar_url,
  };

  return (
    <SidebarProvider
      style={
        {
          "--sidebar-width": SIDEBAR_WIDTH,
          "--header-height": "calc(var(--spacing) * 12)",
        } as React.CSSProperties
      }
    >
      <AppSidebar user={displayUser} onSignOut={signOut} />
      <PageLayout>
        <SiteHeader title="Bank Profiles" />
        <BankProfilesContent />
      </PageLayout>
    </SidebarProvider>
  );
}
