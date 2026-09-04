'use client';

import React, { useEffect, useState } from 'react';
import {
  Card,
  CardContent,
  Badge,
  cn,
  SearchInput,
  StatusDot,
  EmptyState,
  Spinner,
  Skeleton,
  DataTable,
} from '@mizpah-pulse/ui';
import { ContractInvokeModal } from '@/components/ContractInvokeModal';
import { useWallet } from '@/context/WalletContext';
import { formatTimeAgo } from '@/lib/date-utils';
import { FileCode, Zap, AlertTriangle, CheckCircle, ExternalLink, History } from 'lucide-react';

interface ContractActivity {
  id: string;
  contractId: string;
  name: string;
  invocations: number;
  lastCalled: string;
  status: 'active' | 'error' | 'idle';
}

/** A recent SOROBAN_INVOKE event shown in the invocation history panel (#14). */
interface InvocationRecord {
  id: string;
  severity: string;
  timestamp: string;
  transactionHash: string | null;
  payload: Record<string, unknown> | null;
}

// PulseContract ID — deployed on Stellar Testnet
const DEPLOYED_CONTRACT_ID =
  process.env.NEXT_PUBLIC_PULSE_CONTRACT_ID ||
  'CC4HXCVIOPUOS2UJFLTM6WP2ESNSWM4BGJ26XR4SRRVB74TOZMC7EE2C';

// Fallback sample data shown when the API (or its database) is unavailable
const mockContracts: ContractActivity[] = [
  {
    id: 'pulse',
    contractId: DEPLOYED_CONTRACT_ID,
    name: 'PulseContract (Deployed)',
    invocations: 0,
    lastCalled: '—',
    status: 'active',
  },
  {
    id: '2',
    contractId: 'CB3XDEF1234567890ABCDEFGHIJKLMNOPQRSTUVW',
    name: 'Aqua DEX Router',
    invocations: 654,
    lastCalled: '5s ago',
    status: 'active',
  },
  {
    id: '3',
    contractId: 'CD9YGHI1234567890ABCDEFGHIJKLMNOPQRSTUVW',
    name: 'BLND Lending Pool',
    invocations: 421,
    lastCalled: '1 min ago',
    status: 'active',
  },
  {
    id: '4',
    contractId: 'CE2ZJKL1234567890ABCDEFGHIJKLMNOPQRSTUVW',
    name: 'NFT Marketplace',
    invocations: 298,
    lastCalled: '30s ago',
    status: 'error',
  },
];

const statusIcon = {
  active: <CheckCircle className="h-4 w-4 text-emerald-500" />,
  error: <AlertTriangle className="h-4 w-4 text-red-500" />,
  idle: <Zap className="h-4 w-4 text-slate-400" />,
};

/** Best-effort Soroban function name from an invocation event payload. */
function invocationFunction(record: InvocationRecord): string {
  const payload = record.payload;
  if (payload) {
    for (const key of ['functionName', 'function', 'op']) {
      const value = payload[key];
      if (typeof value === 'string' && value.length > 0) return value;
    }
  }
  return 'contract invoke';
}

/** Whether an invocation event represents a failed execution. */
function invocationFailed(record: InvocationRecord): boolean {
  const severity = record.severity.toUpperCase();
  if (severity === 'ERROR' || severity === 'CRITICAL') return true;
  const status = record.payload?.status;
  return (
    typeof status === 'string' && ['failed', 'error', 'reverted'].includes(status.toLowerCase())
  );
}

export default function ContractsPage() {
  const { isConnected } = useWallet();
  const [search, setSearch] = useState('');
  const [invokeContractId, setInvokeContractId] = useState<string | null>(null);
  const [contracts, setContracts] = useState<ContractActivity[]>(mockContracts);
  const [loading, setLoading] = useState(true);
  // Recent invocations of the deployed Pulse contract — null while loading.
  const [invocations, setInvocations] = useState<InvocationRecord[] | null>(null);
  const [invocationsFailed, setInvocationsFailed] = useState(false);

  // Load real contract activity from the API, falling back to sample data
  useEffect(() => {
    let cancelled = false;
    fetch('/api/v1/contracts')
      .then((r) => (r.ok ? r.json() : null))
      .then((body) => {
        if (cancelled || !body?.data || !Array.isArray(body.data)) return;
        const apiContracts: ContractActivity[] = body.data
          .filter((c: { contractId: string | null }) => !!c.contractId)
          .slice(0, 19) // keep room for the deployed Pulse contract row
          .map((c: { contractId: string; eventCount: number }) => ({
            id: c.contractId,
            contractId: c.contractId,
            name:
              c.contractId === DEPLOYED_CONTRACT_ID
                ? 'PulseContract (Deployed)'
                : `Contract ${c.contractId.slice(0, 6)}…`,
            invocations: c.eventCount,
            lastCalled: '—',
            status: c.eventCount > 0 ? 'active' : 'idle',
          }));
        // Always surface the deployed PulseContract, even before its first event lands in the DB
        const hasPulse = apiContracts.some((c) => c.contractId === DEPLOYED_CONTRACT_ID);
        if (!hasPulse) {
          apiContracts.unshift({
            id: 'pulse',
            contractId: DEPLOYED_CONTRACT_ID,
            name: 'PulseContract (Deployed)',
            invocations: 0,
            lastCalled: '—',
            status: 'active',
          });
        }
        setContracts(apiContracts);
      })
      .catch(() => {
        // API unavailable — keep sample data
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Load recent SOROBAN_INVOKE events for the deployed Pulse contract (#14).
  useEffect(() => {
    let cancelled = false;
    const url =
      `/api/v1/contracts/${DEPLOYED_CONTRACT_ID}/events` + '?eventType=SOROBAN_INVOKE&limit=6';
    fetch(url)
      .then((r) => (r.ok ? r.json() : null))
      .then((body) => {
        if (cancelled) return;
        if (!body?.data?.events) {
          setInvocationsFailed(true);
          return;
        }
        setInvocations(
          body.data.events.map((e: Record<string, unknown>) => ({
            id: String(e.id),
            severity: typeof e.severity === 'string' ? e.severity : 'INFO',
            timestamp: String(e.timestamp),
            transactionHash:
              typeof e.transactionHash === 'string' ? (e.transactionHash as string) : null,
            payload:
              e.payload && typeof e.payload === 'object'
                ? (e.payload as Record<string, unknown>)
                : null,
          })),
        );
      })
      .catch(() => {
        if (!cancelled) setInvocationsFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = contracts.filter(
    (c) =>
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      c.contractId.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Smart Contracts</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Monitor Soroban smart contract activity in real-time
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        {[
          { label: 'Tracked Contracts', value: loading ? '…' : contracts.length },
          {
            label: 'Active (24h)',
            value: loading ? '…' : contracts.filter((c) => c.status === 'active').length,
          },
          {
            label: 'Total Invocations',
            value: loading
              ? '…'
              : contracts.reduce((s, c) => s + c.invocations, 0).toLocaleString(),
          },
        ].map((stat) => (
          <Card key={stat.label} padding="md">
            <div className="text-center">
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400">{stat.label}</p>
              <p className="mt-1 text-2xl font-bold text-slate-900 dark:text-slate-100">
                {stat.value}
              </p>
            </div>
          </Card>
        ))}
      </div>

      <SearchInput
        value={search}
        onChange={setSearch}
        placeholder="Search by contract name or ID..."
        className="w-full sm:w-96"
      />

      {filtered.length === 0 ? (
        <EmptyState
          icon={<FileCode className="h-10 w-10" />}
          title="No contracts found"
          description="Try a different search term"
        />
      ) : (
        /* Responsive table: real table on md+, stacked cards on mobile (#22) */
        <DataTable
          rows={filtered}
          rowKey={(c) => c.id}
          caption="Tracked smart contracts"
          defaultSortIndex={2}
          columns={[
            {
              header: 'Contract',
              cell: (c) => (
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-slate-900 dark:text-slate-100">{c.name}</span>
                  {statusIcon[c.status]}
                  {c.id === 'pulse' && isConnected && (
                    <Badge variant="success" size="sm">
                      Deployed
                    </Badge>
                  )}
                </div>
              ),
            },
            {
              header: 'Contract ID',
              cell: (c) => (
                <span className="font-mono text-xs text-slate-500">
                  {c.contractId.slice(0, 12)}...{c.contractId.slice(-8)}
                </span>
              ),
            },
            {
              header: 'Invocations',
              sortValue: (c) => c.invocations,
              className: 'text-right',
              cell: (c) => (
                <span className="font-bold text-slate-900 dark:text-slate-100">
                  {c.invocations.toLocaleString()}
                </span>
              ),
            },
            {
              header: 'Last called',
              cell: (c) => <span className="text-xs text-slate-400">{c.lastCalled}</span>,
            },
            ...(isConnected
              ? [
                  {
                    header: '',
                    className: 'text-right',
                    cell: (c: ContractActivity) => (
                      <button
                        onClick={() => setInvokeContractId(c.contractId)}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-50 px-3 py-2 text-xs font-semibold text-indigo-600 transition-colors hover:bg-indigo-100 dark:bg-indigo-950 dark:text-indigo-400 dark:hover:bg-indigo-900"
                      >
                        <Zap className="h-3.5 w-3.5" />
                        Invoke
                      </button>
                    ),
                  },
                ]
              : []),
          ]}
        />
      )}

      {/* Recent Invocations (#14): SOROBAN_INVOKE history for the deployed
          Pulse contract, fetched from /api/v1/contracts/:id/events. */}
      <Card>
        <CardContent>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <History className="h-5 w-5 text-indigo-500" aria-hidden="true" />
              <div>
                <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                  Recent Invocations
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Latest SOROBAN_INVOKE events for the deployed Pulse contract
                </p>
              </div>
            </div>
            <a
              href={`https://stellar.expert/explorer/testnet/contract/${DEPLOYED_CONTRACT_ID}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-sm font-medium text-indigo-600 hover:text-indigo-700 dark:text-indigo-400"
            >
              View contract
              <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
            </a>
          </div>

          {invocationsFailed ? (
            <p className="rounded-lg bg-red-50 px-4 py-6 text-center text-sm text-red-600 dark:bg-red-950 dark:text-red-400">
              Could not load invocation history. Please try again later.
            </p>
          ) : invocations === null ? (
            <div className="space-y-2" data-testid="invocation-history-skeleton" aria-hidden="true">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3 rounded-lg p-3">
                  <Skeleton className="h-4 w-32" />
                  <div className="flex-1">
                    <Skeleton className="h-3 w-48" />
                  </div>
                  <Skeleton className="h-5 w-16 rounded-full" />
                </div>
              ))}
            </div>
          ) : invocations.length === 0 ? (
            <p className="rounded-lg bg-slate-50 px-4 py-6 text-center text-sm text-slate-500 dark:bg-slate-900 dark:text-slate-400">
              No invocations recorded yet — invoke the Pulse contract to see history here.
            </p>
          ) : (
            <ul className="divide-y divide-slate-100 dark:divide-slate-800">
              {invocations.map((record) => {
                const failed = invocationFailed(record);
                const txHash = record.transactionHash;
                return (
                  <li key={record.id} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-slate-900 dark:text-slate-100">
                        {invocationFunction(record)}
                      </p>
                      <p className="text-xs text-slate-400">{formatTimeAgo(record.timestamp)}</p>
                    </div>
                    <Badge variant={failed ? 'error' : 'success'} size="sm" dot>
                      {failed ? 'Failed' : 'Success'}
                    </Badge>
                    {txHash ? (
                      <a
                        href={`https://stellar.expert/explorer/testnet/tx/${txHash}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label="View transaction on Stellar Expert"
                        className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-indigo-500 dark:hover:bg-slate-800"
                      >
                        <ExternalLink className="h-4 w-4" aria-hidden="true" />
                      </a>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* Contract Invocation Modal */}
      {invokeContractId && (
        <ContractInvokeModal
          contractId={invokeContractId}
          isOpen={!!invokeContractId}
          onClose={() => setInvokeContractId(null)}
        />
      )}
    </div>
  );
}
