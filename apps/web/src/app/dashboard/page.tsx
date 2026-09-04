'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Card, CardContent, cn, Skeleton, Tooltip } from '@mizpah-pulse/ui';
import {
  Activity,
  ArrowLeftRight,
  Check,
  Copy,
  FileCode,
  Info,
  Send,
  TrendingUp,
  Trophy,
  Wallet,
} from 'lucide-react';
import { formatTimeAgo } from '@/lib/date-utils';
import { truncateAddress } from '@/lib/display-utils';
import { apiFetch } from '@/lib/api-client';

interface RecentActivityItem {
  id: string;
  eventType: string;
  category: string;
  timestamp: string;
  accountId: string | null;
}

interface TopAccount {
  accountId: string;
  count: number;
}

interface DashboardStats {
  totalEvents: number;
  eventsLast24h: number;
  uniqueAccounts: number;
  trackedContracts: number;
  topAccounts: TopAccount[];
  recentActivity: RecentActivityItem[];
}

const FALLBACK_STATS: DashboardStats = {
  totalEvents: 8432,
  eventsLast24h: 1247,
  uniqueAccounts: 156,
  trackedContracts: 12,
  topAccounts: [
    {
      accountId: 'GABC1234567890ABCDEFGHIJKLMNOPQRSTUVWXYZ',
      count: 128,
    },
    {
      accountId: 'GDEF1234567890ABCDEFGHIJKLMNOPQRSTUVWXYZ',
      count: 96,
    },
    {
      accountId: 'GHIJ1234567890ABCDEFGHIJKLMNOPQRSTUVWXYZ',
      count: 74,
    },
    {
      accountId: 'GKLM1234567890ABCDEFGHIJKLMNOPQRSTUVWXYZ',
      count: 51,
    },
    {
      accountId: 'GNOP1234567890ABCDEFGHIJKLMNOPQRSTUVWXYZ',
      count: 29,
    },
  ],
  recentActivity: [
    {
      id: '1',
      eventType: 'PAYMENT',
      category: 'PAYMENT',
      timestamp: new Date(Date.now() - 2000).toISOString(),
      accountId: 'GABC1234567890ABCDEFGHIJKLMNOPQRSTUVWXYZ',
    },
    {
      id: '2',
      eventType: 'DEX_TRADE',
      category: 'DEX',
      timestamp: new Date(Date.now() - 5000).toISOString(),
      accountId: 'GDEF1234567890ABCDEFGHIJKLMNOPQRSTUVWXYZ',
    },
    {
      id: '3',
      eventType: 'SOROBAN_INVOKE',
      category: 'CONTRACT',
      timestamp: new Date(Date.now() - 8000).toISOString(),
      accountId: 'GHIJ1234567890ABCDEFGHIJKLMNOPQRSTUVWXYZ',
    },
    {
      id: '4',
      eventType: 'NFT_TRANSFER',
      category: 'NFT',
      timestamp: new Date(Date.now() - 12000).toISOString(),
      accountId: 'GKLM1234567890ABCDEFGHIJKLMNOPQRSTUVWXYZ',
    },
    {
      id: '5',
      eventType: 'CREATE_ACCOUNT',
      category: 'ACCOUNT',
      timestamp: new Date(Date.now() - 15000).toISOString(),
      accountId: 'GNOP1234567890ABCDEFGHIJKLMNOPQRSTUVWXYZ',
    },
  ],
};

const statusColors: Record<string, string> = {
  success: 'bg-emerald-400',
  error: 'bg-red-400',
  warning: 'bg-amber-400',
};

type DataSource = 'loading' | 'live' | 'sample';

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats>(FALLBACK_STATS);
  const [dataSource, setDataSource] = useState<DataSource>('loading');
  const [loadError, setLoadError] = useState<string | null>(null);
  // Which top-account address currently shows the "copied" affordance.
  const [copiedAccount, setCopiedAccount] = useState<string | null>(null);

  const loadStats = useCallback(async () => {
    setDataSource('loading');
    setLoadError(null);
    try {
      const data = await apiFetch<DashboardStats>('/api/v1/stats');
      setStats(data);
      setDataSource('live');
    } catch (err) {
      // API unavailable (no DB / not running) — keep fallback sample data
      // but surface that the numbers are illustrative, not live.
      setDataSource('sample');
      setLoadError(err instanceof Error ? err.message : 'Failed to load stats');
    }
  }, []);

  // Load real stats from the API, falling back to sample data if unavailable.
  useEffect(() => {
    const controller = new AbortController();
    const run = async () => {
      try {
        const data = await apiFetch<DashboardStats>('/api/v1/stats', {
          signal: controller.signal,
        });
        if (controller.signal.aborted) return;
        setStats(data);
        setDataSource('live');
      } catch (err) {
        if (controller.signal.aborted) return;
        setDataSource('sample');
        setLoadError(err instanceof Error ? err.message : 'Failed to load stats');
      }
    };
    void run();
    return () => controller.abort();
  }, []);

  const loading = dataSource === 'loading';

  /** Copy a top-account address to the clipboard with a brief confirmation. */
  const copyAccount = useCallback(async (accountId: string) => {
    try {
      await navigator.clipboard?.writeText(accountId);
    } catch {
      // Clipboard API unavailable (e.g. insecure context) — fall back to the
      // legacy textarea trick so the address is still copyable.
      const textarea = document.createElement('textarea');
      textarea.value = accountId;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
    }
    setCopiedAccount(accountId);
    window.setTimeout(() => {
      setCopiedAccount((current) => (current === accountId ? null : current));
    }, 1500);
  }, []);

  const statCards = [
    {
      label: 'Events (24h)',
      value: stats.eventsLast24h.toLocaleString(),
      icon: Activity,
      color: 'text-indigo-500 bg-indigo-50 dark:bg-indigo-950',
      tooltip: 'Events ingested and indexed in the last 24 hours.',
    },
    {
      label: 'Total Events',
      value: stats.totalEvents.toLocaleString(),
      icon: ArrowLeftRight,
      color: 'text-purple-500 bg-purple-50 dark:bg-purple-950',
      tooltip: 'All events indexed by MizpahPulse since the indexer went live.',
    },
    {
      label: 'Tracked Contracts',
      value: stats.trackedContracts.toLocaleString(),
      icon: FileCode,
      color: 'text-emerald-500 bg-emerald-50 dark:bg-emerald-950',
      tooltip: 'Smart contracts referenced by at least one indexed event.',
    },
    {
      label: 'Unique Accounts',
      value: stats.uniqueAccounts.toLocaleString(),
      icon: Send,
      color: 'text-amber-500 bg-amber-50 dark:bg-amber-950',
      tooltip: 'Distinct Stellar accounts observed in indexed events.',
    },
  ];

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Dashboard</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Real-time overview of Stellar network activity
          </p>
        </div>
        {dataSource === 'sample' && (
          <div
            role="status"
            className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-700 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-300"
          >
            <span className="h-2 w-2 rounded-full bg-amber-400" aria-hidden="true" />
            Showing sample data — live API unavailable
            <button
              onClick={() => {
                void loadStats();
              }}
              className="ml-1 font-semibold underline underline-offset-2 hover:text-amber-900 dark:hover:text-amber-200"
            >
              Retry
            </button>
          </div>
        )}
        {dataSource === 'live' && (
          <span
            className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
            role="status"
          >
            <span className="h-2 w-2 rounded-full bg-emerald-400" aria-hidden="true" />
            Live from API
          </span>
        )}
      </div>

      {/* Stats Grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {statCards.map((stat) => (
          <Card key={stat.label} padding="lg" hover>
            <div className="flex items-start justify-between">
              <div className="space-y-1">
                <div className="flex items-center gap-1.5">
                  <p className="text-sm font-medium text-slate-500 dark:text-slate-400">
                    {stat.label}
                  </p>
                  <Tooltip content={stat.tooltip} position="top">
                    <button
                      type="button"
                      aria-label={`About ${stat.label}`}
                      className="rounded-full p-0.5 text-slate-300 transition-colors hover:text-slate-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 dark:text-slate-600 dark:hover:text-slate-400"
                    >
                      <Info className="h-3.5 w-3.5" aria-hidden="true" />
                    </button>
                  </Tooltip>
                </div>
                <div className="text-2xl font-bold text-slate-900 dark:text-slate-100">
                  {loading ? <Skeleton className="h-8 w-20" /> : stat.value}
                </div>
                <p className="text-xs font-medium text-slate-400">
                  {loading ? 'Loading…' : dataSource === 'live' ? 'Live from API' : 'Sample data'}
                </p>
              </div>
              <div className={cn('rounded-xl p-2.5', stat.color)}>
                <stat.icon className="h-5 w-5" />
              </div>
            </div>
          </Card>
        ))}
      </div>

      {/* Quick Links */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          {
            label: 'Live Feed',
            href: '/dashboard/feed',
            icon: Activity,
            desc: 'Real-time event stream',
          },
          {
            label: 'Analytics',
            href: '/dashboard/analytics',
            icon: TrendingUp,
            desc: 'Charts & insights',
          },
          {
            label: 'Wallets',
            href: '/dashboard/wallets',
            icon: Wallet,
            desc: 'Track your wallets',
          },
          {
            label: 'Contracts',
            href: '/dashboard/contracts',
            icon: FileCode,
            desc: 'Smart contract monitor',
          },
        ].map((link) => (
          <Link key={link.href} href={link.href}>
            <Card padding="lg" hover>
              <link.icon className="mb-3 h-6 w-6 text-indigo-500" />
              <h3 className="font-semibold text-slate-900 dark:text-slate-100">{link.label}</h3>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{link.desc}</p>
            </Card>
          </Link>
        ))}
      </div>

      {/* Top Accounts */}
      <Card>
        <CardContent>
          <div className="mb-4 flex items-center gap-2">
            <Trophy className="h-5 w-5 text-amber-500" aria-hidden="true" />
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
              Top Accounts
            </h2>
          </div>
          {loading ? (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3 rounded-lg p-3">
                  <Skeleton className="h-4 w-6" />
                  <div className="flex-1 space-y-1.5">
                    <Skeleton className="h-4 w-52" />
                  </div>
                  <Skeleton className="h-3 w-16" />
                </div>
              ))}
            </div>
          ) : (stats.topAccounts ?? []).length === 0 ? (
            <p className="rounded-lg bg-slate-50 px-4 py-6 text-center text-sm text-slate-500 dark:bg-slate-900 dark:text-slate-400">
              No account activity recorded yet — events will appear here as they are indexed.
            </p>
          ) : (
            <ol className="space-y-1">
              {(stats.topAccounts ?? []).map((account, index) => {
                const isCopied = copiedAccount === account.accountId;
                return (
                  <li
                    key={account.accountId}
                    className="flex items-center gap-3 rounded-lg p-3 transition-colors hover:bg-slate-50 dark:hover:bg-slate-900"
                  >
                    <span className="w-5 flex-shrink-0 text-sm font-semibold text-slate-400 dark:text-slate-500">
                      {index + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-mono text-sm text-slate-900 dark:text-slate-100">
                        {truncateAddress(account.accountId)}
                      </p>
                    </div>
                    <span className="flex-shrink-0 text-xs font-medium text-slate-500 dark:text-slate-400">
                      {account.count.toLocaleString()} events
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        void copyAccount(account.accountId);
                      }}
                      aria-label={`Copy ${truncateAddress(account.accountId)}`}
                      className="flex-shrink-0 rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-indigo-500 dark:hover:bg-slate-800"
                    >
                      {isCopied ? (
                        <Check className="h-4 w-4 text-emerald-500" aria-hidden="true" />
                      ) : (
                        <Copy className="h-4 w-4" aria-hidden="true" />
                      )}
                    </button>
                  </li>
                );
              })}
            </ol>
          )}
        </CardContent>
      </Card>

      {/* Recent Activity */}
      <Card>
        <CardContent>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
              Recent Activity
            </h2>
            <Link
              href="/dashboard/feed"
              className="text-sm font-medium text-indigo-600 hover:text-indigo-700 dark:text-indigo-400"
            >
              View all →
            </Link>
          </div>
          <div className="space-y-2">
            {loading
              ? Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="flex items-center gap-3 rounded-lg p-3">
                    <Skeleton variant="circular" className="h-2.5 w-2.5" />
                    <div className="flex-1 space-y-1.5">
                      <Skeleton className="h-4 w-40" />
                      <Skeleton className="h-3 w-64" />
                    </div>
                    <Skeleton className="h-3 w-16" />
                  </div>
                ))
              : stats.recentActivity.map((event) => (
                  <div
                    key={event.id}
                    className="flex items-center gap-3 rounded-lg p-3 transition-colors hover:bg-slate-50 dark:hover:bg-slate-900"
                  >
                    <span
                      className={cn('h-2.5 w-2.5 flex-shrink-0 rounded-full', statusColors.success)}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                        {event.eventType.replace(/_/g, ' ')}
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        {event.accountId ? truncateAddress(event.accountId) : '—'}
                        {event.category ? ` • ${event.category}` : ''}
                      </p>
                    </div>
                    <span className="ml-auto flex-shrink-0 text-xs text-slate-400 dark:text-slate-500">
                      {formatTimeAgo(event.timestamp)}
                    </span>
                  </div>
                ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
