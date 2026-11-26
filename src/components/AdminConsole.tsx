"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import type {
  ActiveSessionRecord,
  FinisherRecord,
  PublicHuntPackSummary
} from "@/lib/types";

interface AdminStateResponse {
  hunt: {
    id: string;
    title: string;
    venueName: string;
    totalStops: number;
    maxWinners: number;
  };
  availablePacks: PublicHuntPackSummary[];
  prizesRemaining: number;
  finishers: FinisherRecord[];
  activeSessions: ActiveSessionRecord[];
}

const PIN_STORAGE_KEY = "angana_admin_pin_v1";

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString("en-IN", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit"
    });
  } catch {
    return iso;
  }
}

export function AdminConsole() {
  const [pinInput, setPinInput] = useState("");
  const [verifiedPin, setVerifiedPin] = useState<string | null>(null);
  const [selectedHuntId, setSelectedHuntId] = useState<string>("");
  const [state, setState] = useState<AdminStateResponse | null>(null);
  const [qrBaseUrl, setQrBaseUrl] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setQrBaseUrl(window.location.origin);
    const savedPin = window.sessionStorage.getItem(PIN_STORAGE_KEY);
    if (savedPin) {
      setVerifiedPin(savedPin);
    }
  }, []);

  const fetchAdminState = useCallback(
    async (pin: string, huntId?: string) => {
      setLoading(true);
      setError(null);
      try {
        const qs = huntId ? `?huntId=${encodeURIComponent(huntId)}` : "";
        const res = await fetch(`/api/admin/state${qs}`, {
          headers: { "x-admin-pin": pin },
          cache: "no-store"
        });
        const data = await res.json();
        if (!res.ok) {
          if (res.status === 401) {
            window.sessionStorage.removeItem(PIN_STORAGE_KEY);
            setVerifiedPin(null);
          }
          throw new Error(data.error || "Could not load host console.");
        }
        window.sessionStorage.setItem(PIN_STORAGE_KEY, pin);
        setVerifiedPin(pin);
        setState(data as AdminStateResponse);
        setSelectedHuntId((data as AdminStateResponse).hunt.id);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Authentication failed.");
      } finally {
        setLoading(false);
      }
    },
    []
  );

  useEffect(() => {
    if (verifiedPin && !state) {
      void fetchAdminState(verifiedPin);
    }
  }, [verifiedPin, state, fetchAdminState]);

  const handlePinSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void fetchAdminState(pinInput.trim(), selectedHuntId || undefined);
  };

  const handleToggleRedeem = async (finisher: FinisherRecord) => {
    if (!verifiedPin || !state) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/action", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-admin-pin": verifiedPin
        },
        body: JSON.stringify({
          action: "toggle_redeem",
          huntId: state.hunt.id,
          sessionId: finisher.sessionId,
          redeemed: !finisher.redeemed
        })
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to update bag status.");
      }
      await fetchAdminState(verifiedPin, state.hunt.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Update failed.");
      setLoading(false);
    }
  };

  const handleResetHunt = async () => {
    if (!verifiedPin || !state) return;
    const confirmed = window.confirm(
      `Clear all finishers and sessions for "${state.hunt.title}"?`
    );
    if (!confirmed) return;

    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/action", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-admin-pin": verifiedPin
        },
        body: JSON.stringify({
          action: "reset_hunt",
          huntId: state.hunt.id
        })
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Could not reset hunt state.");
      }
      await fetchAdminState(verifiedPin, state.hunt.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Reset failed.");
      setLoading(false);
    }
  };

  const qrTargetUrl = state
    ? `${qrBaseUrl.replace(/\/+$/, "")}/?hunt=${encodeURIComponent(state.hunt.id)}`
    : qrBaseUrl;

  return (
    <main className="shell shell-wide">
      <header className="topbar">
        <div className="brand-mark">
          <span className="brand-title">Host &amp; Gift-Table Console</span>
        </div>
        <div className="topbar-meta">
          <Link href="/" className="quiet-link">
            Guest Trail View
          </Link>
        </div>
      </header>

      {error ? (
        <div
          className="feedback-banner"
          data-tone="error"
          style={{ marginBottom: 18 }}
          role="alert"
        >
          <div className="feedback-title">Console notice</div>
          <p className="feedback-text">{error}</p>
        </div>
      ) : null}

      {!verifiedPin || !state ? (
        <section className="panel" style={{ maxWidth: 420 }}>
          <h1 className="section-heading">Enter Host PIN</h1>
          <p className="lead-copy" style={{ marginBottom: 18 }}>
            Check the first five goody-bag winners, toggle bag handoffs, and
            print table QR codes. Default local PIN is <code className="mono-num">2026</code>.
          </p>
          <form onSubmit={handlePinSubmit}>
            <label htmlFor="admin-pin" className="field-label">
              PIN
            </label>
            <input
              id="admin-pin"
              type="password"
              inputMode="numeric"
              className="text-input"
              placeholder="2026"
              value={pinInput}
              onChange={(e) => setPinInput(e.target.value)}
              required
            />
            <div style={{ marginTop: 14 }}>
              <button
                type="submit"
                className="btn btn-primary"
                disabled={loading}
              >
                {loading ? "Checking PIN..." : "Unlock Console"}
              </button>
            </div>
          </form>
        </section>
      ) : (
        <>
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              justifyContent: "space-between",
              alignItems: "center",
              gap: 12,
              marginBottom: 20
            }}
          >
            <div className="pack-switcher" style={{ marginBottom: 0 }}>
              {state.availablePacks.map((pack) => (
                <button
                  key={pack.id}
                  type="button"
                  className="pack-tab"
                  data-active={pack.id === state.hunt.id}
                  onClick={() => fetchAdminState(verifiedPin, pack.id)}
                >
                  {pack.title}
                </button>
              ))}
            </div>

            <div style={{ display: "flex", gap: 8 }}>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => fetchAdminState(verifiedPin, state.hunt.id)}
                disabled={loading}
              >
                Refresh
              </button>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={handleResetHunt}
                disabled={loading}
              >
                Reset test run
              </button>
            </div>
          </div>

          <div className="prize-ledger" style={{ marginBottom: 22 }}>
            <div className="ledger-cell">
              <span className="ledger-label">Goody bags remaining</span>
              <span className="ledger-value">
                {state.prizesRemaining} of {state.hunt.maxWinners}
              </span>
            </div>
            <div className="ledger-cell">
              <span className="ledger-label">Finishers / Active guests</span>
              <span className="ledger-value">
                {state.finishers.length} finished · {state.activeSessions.length}{" "}
                started
              </span>
            </div>
          </div>

          <div className="admin-grid">
            <section className="panel">
              <h2 className="section-heading" style={{ fontSize: "1.4rem" }}>
                Finishers &amp; Goody Bag Claims
              </h2>

              {state.finishers.length === 0 ? (
                <p className="lead-copy" style={{ marginBottom: 0 }}>
                  No guests have completed all {state.hunt.totalStops} stops yet.
                  The first {state.hunt.maxWinners} finishers appear here
                  automatically with claim codes.
                </p>
              ) : (
                <div className="roster-table-wrap">
                  <table className="roster-table">
                    <thead>
                      <tr>
                        <th>Rank</th>
                        <th>Guest / Pair</th>
                        <th>Claim Code</th>
                        <th>Finished</th>
                        <th>Goody Bag</th>
                      </tr>
                    </thead>
                    <tbody>
                      {state.finishers.map((f) => (
                        <tr key={f.sessionId}>
                          <td className="mono-num">#{f.rank}</td>
                          <td>
                            <strong>{f.playerName}</strong>
                            {f.pureSleuth ? (
                              <div
                                style={{
                                  fontSize: "0.75rem",
                                  color: "var(--success)",
                                  marginTop: 2
                                }}
                              >
                                No-Hint Sleuth
                              </div>
                            ) : null}
                          </td>
                          <td className="mono-num">
                            {f.claimCode ? (
                              <span>{f.claimCode}</span>
                            ) : (
                              <span style={{ color: "var(--ink-muted)" }}>
                                Finisher pass
                              </span>
                            )}
                          </td>
                          <td className="mono-num">
                            {formatTime(f.finishedAt)}
                          </td>
                          <td>
                            {f.isPrizeWinner ? (
                              <button
                                type="button"
                                className="btn btn-ghost"
                                onClick={() => handleToggleRedeem(f)}
                                disabled={loading}
                              >
                                {f.redeemed ? "Bag handed out" : "Mark claimed"}
                              </button>
                            ) : (
                              <span
                                style={{
                                  fontSize: "0.82rem",
                                  color: "var(--ink-muted)"
                                }}
                              >
                                After top {state.hunt.maxWinners}
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            <aside className="panel">
              <h2 className="section-heading" style={{ fontSize: "1.4rem" }}>
                Table QR Code
              </h2>
              <p
                style={{
                  fontSize: "0.88rem",
                  color: "var(--ink-muted)",
                  margin: "0 0 12px"
                }}
              >
                Enter your custom domain (or LAN IP when testing on phone at
                home) to generate a scannable SVG QR code for this trail.
              </p>
              <label htmlFor="qr-base" className="field-label">
                Base URL
              </label>
              <input
                id="qr-base"
                type="url"
                className="text-input"
                value={qrBaseUrl}
                onChange={(e) => setQrBaseUrl(e.target.value)}
              />

              {qrTargetUrl.startsWith("http") ? (
                <>
                  <div className="qr-frame">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={`/api/qr?url=${encodeURIComponent(qrTargetUrl)}`}
                      alt={`QR code for ${qrTargetUrl}`}
                    />
                  </div>
                  <p
                    className="mono-num"
                    style={{
                      fontSize: "0.78rem",
                      color: "var(--ink-muted)",
                      wordBreak: "break-all",
                      margin: "0 0 12px"
                    }}
                  >
                    {qrTargetUrl}
                  </p>
                  <a
                    href={`/api/qr?url=${encodeURIComponent(qrTargetUrl)}`}
                    download={`${state.hunt.id}-qr.svg`}
                    className="btn btn-secondary"
                    style={{ textDecoration: "none" }}
                  >
                    Download SVG for print
                  </a>
                </>
              ) : null}
            </aside>
          </div>
        </>
      )}
    </main>
  );
}
