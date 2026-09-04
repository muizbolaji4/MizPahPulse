/**
 * Component tests for the contracts-page invocation history panel (issue #14).
 *
 * Renders the real ContractsPage with a stubbed fetch: the contract list and
 * the deployed contract's SOROBAN_INVOKE events endpoint are both mocked so
 * loading, row rendering, empty, and error states can be driven.
 */
import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import ContractsPage from '@/app/dashboard/contracts/page';

vi.mock('@/context/WalletContext', () => ({
  useWallet: vi.fn(() => ({ isConnected: true })),
}));

const fetchMock = vi.fn();

const TX_HASH = 'abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789';

const invocationEvent = (overrides: Record<string, unknown> = {}) => ({
  id: 'evt-1',
  eventType: 'SOROBAN_INVOKE',
  category: 'CONTRACT',
  severity: 'INFO',
  timestamp: '2026-09-01T10:00:00.000Z',
  transactionHash: TX_HASH,
  accountId: 'GABC1234567890ABCDEFGHIJKLMNOPQRSTUVWXYZ',
  contractId: 'CC4HXCVIOPUOS2UJFLTM6WP2ESNSWM4BGJ26XR4SRRVB74TOZMC7EE2C',
  payload: { functionName: 'pulse', args: [] },
  ...overrides,
});

const eventsBody = (events: unknown[]) => ({
  success: true,
  data: { contractId: 'CC4HXCVIOPUOS2UJFLTM6WP2ESNSWM4BGJ26XR4SRRVB74TOZMC7EE2C', events },
});

/** fetch stub: events URL → given body; contract list → empty (keeps Pulse row). */
function stubFetch(eventsResponse: unknown) {
  fetchMock.mockImplementation((input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes('/events')) {
      return Promise.resolve({ ok: true, json: async () => eventsResponse });
    }
    return Promise.resolve({ ok: true, json: async () => ({ success: true, data: [] }) });
  });
  vi.stubGlobal('fetch', fetchMock);
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe('ContractsPage recent invocations (#14)', () => {
  it('renders invocation rows with function, status, and an explorer link', async () => {
    stubFetch(eventsBody([invocationEvent(), invocationEvent({ id: 'evt-2', payload: {} })]));

    render(<ContractsPage />);

    expect(await screen.findByText('Recent Invocations')).toBeInTheDocument();

    // Function names come from the event payload when available.
    expect(await screen.findByText('pulse')).toBeInTheDocument();
    // Payload-less events fall back to a generic label.
    expect(screen.getByText('contract invoke')).toBeInTheDocument();
    expect(screen.getAllByText('Success')).toHaveLength(2);

    // Every row links out to Stellar Expert for its transaction.
    expect(
      screen.getAllByRole('link', { name: 'View transaction on Stellar Expert' }),
    ).toHaveLength(2);

    // The events request targets the deployed Pulse contract and only asks for
    // SOROBAN_INVOKE events.
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining(
        '/api/v1/contracts/CC4HXCVIOPUOS2UJFLTM6WP2ESNSWM4BGJ26XR4SRRVB74TOZMC7EE2C/events',
      ),
    );
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('eventType=SOROBAN_INVOKE'));
  });

  it('flags failed invocations', async () => {
    stubFetch(
      eventsBody([
        invocationEvent(),
        invocationEvent({
          id: 'evt-2',
          severity: 'ERROR',
          payload: { functionName: 'swap', status: 'reverted' },
        }),
      ]),
    );

    render(<ContractsPage />);

    expect(await screen.findByText('swap')).toBeInTheDocument();
    expect(screen.getByText('Failed')).toBeInTheDocument();
    expect(screen.getByText('Success')).toBeInTheDocument();
  });

  it('shows a loading state while the history request is in flight', async () => {
    let resolveFetch: ((value: unknown) => void) | undefined;
    fetchMock.mockImplementation((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/events')) {
        return new Promise((resolve) => {
          resolveFetch = resolve;
        });
      }
      return Promise.resolve({ ok: true, json: async () => ({ success: true, data: [] }) });
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<ContractsPage />);

    expect(await screen.findByTestId('invocation-history-skeleton')).toBeInTheDocument();

    resolveFetch?.({ ok: true, json: async () => eventsBody([invocationEvent()]) });
    await waitFor(() =>
      expect(screen.queryByTestId('invocation-history-skeleton')).not.toBeInTheDocument(),
    );
    expect(await screen.findByText('pulse')).toBeInTheDocument();
  });

  it('shows an empty state when no invocations have been recorded', async () => {
    stubFetch(eventsBody([]));

    render(<ContractsPage />);

    expect(await screen.findByText(/No invocations recorded yet/i)).toBeInTheDocument();
  });

  it('shows an error state when the history request fails', async () => {
    fetchMock.mockImplementation((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/events')) {
        return Promise.resolve({ ok: false, status: 500, json: async () => ({}) });
      }
      return Promise.resolve({ ok: true, json: async () => ({ success: true, data: [] }) });
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<ContractsPage />);

    expect(await screen.findByText(/Could not load invocation history/i)).toBeInTheDocument();
  });
});
