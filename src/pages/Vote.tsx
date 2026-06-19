import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useConfetti } from '../hooks/useConfetti';
import { useSession } from '../hooks/useSession';
import { supabase } from '../lib/supabase';
import type { Size, Value } from '../lib/types';

const SIZES: { key: Size; label: string }[] = [
  { key: 'xs', label: 'XS' },
  { key: 's', label: 'S' },
  { key: 'm', label: 'M' },
  { key: 'l', label: 'L' },
  { key: 'xl', label: 'XL' },
];

const VALUES: { key: Value; emoji: string; label: string; desc: string }[] = [
  { key: 'gold', emoji: '🥇', label: 'Gull', desc: 'Høy verdi' },
  { key: 'silver', emoji: '🥈', label: 'Sølv', desc: 'Middels' },
  { key: 'bronze', emoji: '🥉', label: 'Bronse', desc: 'Lav verdi' },
];

const VALUE_MEDAL: Record<Value, string> = {
  gold: '🥇',
  silver: '🥈',
  bronze: '🥉',
};

const SIZE_ORDER: Record<Size, number> = { xs: 0, s: 1, m: 2, l: 3, xl: 4 };

/**
 * Deltaker Vote-side – fire states:
 * W) Venter på fasilitator (session.started === false)
 * A) notVoted: stemmeform
 * B) hasVoted && !revealed: venter på avsløring
 * C) hasVoted && revealed: vis resultater med konfetti
 */
export function VotePage() {
  const navigate = useNavigate();
  const { session, localParticipant, logout } = useSession();
  const { triggerConfetti } = useConfetti();

  // Navn hentes fra sessionStorage (satt ved join)
  const name = sessionStorage.getItem('estimering_vote_name') ?? localParticipant?.name ?? '';

  const [selectedSize, setSelectedSize] = useState<Size | null>(null);
  const [selectedValue, setSelectedValue] = useState<Value | null>(null);
  const [hasVoted, setHasVoted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Sanntids-stemmer for denne runden
  const [votes, setVotes] = useState<Array<{
    id: string;
    participant_id: string;
    size: Size;
    value: Value;
    round?: number;
  }>>([]);

  // Revealed-state fra session
  const revealed = session?.votes_revealed ?? false;

  // Runde-tracking for reset
  const prevRoundRef = useRef<number | null>(null);
  // Konfetti trigges kun én gang per reveal
  const confettiTriggeredRef = useRef(false);

  // Trigger konfetti ved reveal
  useEffect(() => {
    if (revealed && hasVoted && !confettiTriggeredRef.current) {
      confettiTriggeredRef.current = true;
      triggerConfetti();
    }
  }, [revealed, hasVoted, triggerConfetti]);

  // Reset ved ny runde
  useEffect(() => {
    if (!session) return;
    if (prevRoundRef.current === null) {
      prevRoundRef.current = session.current_round;
      return;
    }
    if (session.current_round !== prevRoundRef.current) {
      prevRoundRef.current = session.current_round;
      setSelectedSize(null);
      setSelectedValue(null);
      setHasVoted(false);
      setSubmitError(null);
      confettiTriggeredRef.current = false;
      setVotes([]);
    }
  }, [session?.current_round]);

  // Last inn stemmer når session og round er kjent
  useEffect(() => {
    if (!session) return;
    void supabase
      .from('votes')
      .select('id, participant_id, size, value')
      .eq('session_id', session.id)
      .eq('round', session.current_round)
      .then(({ data }) => {
        if (data) setVotes(data as typeof votes);
      });

    const channel = supabase
      .channel(`vote-page:${session.id}:${session.current_round}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'votes',
          filter: `session_id=eq.${session.id}`,
        },
        (payload) => {
          const v = payload.new as { id: string; participant_id: string; size: Size; value: Value; round: number };
          if (v.round !== session.current_round) return;
          setVotes((prev) => prev.some((x) => x.id === v.id) ? prev : [...prev, v]);
        },
      )
      .subscribe();

    return () => { void supabase.removeChannel(channel); };
  }, [session?.id, session?.current_round]);

  // Sesjon avsluttet
  useEffect(() => {
    if (session?.status === 'completed') {
      logout();
      navigate('/');
    }
  }, [session?.status, logout, navigate]);

  // Redirect til join hvis ingen sesjon
  useEffect(() => {
    if (!session && !localParticipant) {
      navigate('/join');
    }
  }, [session, localParticipant, navigate]);

  const canVote = selectedSize !== null && selectedValue !== null;

  const handleVote = async () => {
    if (!canVote || !session || !localParticipant) return;

    setSubmitting(true);
    setSubmitError(null);

    const { error: voteError } = await supabase.from('votes').insert({
      session_id: session.id,
      participant_id: localParticipant.participantId,
      round: session.current_round,
      size: selectedSize,
      value: selectedValue,
    });

    setSubmitting(false);

    if (voteError) {
      if (voteError.code === '23505') {
        setSubmitError('Du har allerede stemt i denne runden.');
      } else {
        setSubmitError('Kunne ikke registrere stemme. Prøv igjen.');
      }
      return;
    }

    setHasVoted(true);
    // Legg til egen stemme lokalt
    setVotes((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        participant_id: localParticipant.participantId,
        size: selectedSize!,
        value: selectedValue!,
      },
    ]);
  };

  // ── State W: Venter på fasilitator ─────────────────────────
  if (session && !session.started) {
    const participantCount = undefined; // Ikke tilgjengelig her uten ekstra hook
    void participantCount; // suppress unused warning
    return (
      <div
        className="min-h-screen flex flex-col items-center justify-center px-5 py-10"
        style={{ background: 'oklch(0.965 0.012 165)' }}
      >
        <div className="w-full max-w-sm text-center space-y-6 animate-fadeUp">
          {/* Ikon */}
          <div className="text-7xl animate-pulse-slow">⏳</div>

          <div>
            <h2
              className="text-2xl font-bold"
              style={{ fontFamily: 'Sora, sans-serif', color: 'oklch(0.20 0.06 165)' }}
            >
              Venter på fasilitator…
            </h2>
            <p
              className="mt-2 text-base"
              style={{ fontFamily: 'DM Sans, sans-serif', color: 'oklch(0.45 0.05 165)' }}
            >
              Du er med i sesjonen, {name} 👋
            </p>
          </div>

          {/* Info-kort */}
          <div
            className="bg-white rounded-2xl p-4 space-y-3"
            style={{ boxShadow: '0 2px 16px oklch(0.20 0.06 165 / 0.07)' }}
          >
            <div className="flex justify-between items-center">
              <span
                className="text-sm"
                style={{ fontFamily: 'DM Sans, sans-serif', color: 'oklch(0.50 0.04 165)' }}
              >
                Sesjonskode
              </span>
              <span
                className="font-bold text-sm tracking-widest"
                style={{ fontFamily: 'Sora, sans-serif', color: 'oklch(0.30 0.08 165)' }}
              >
                {session.join_code}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span
                className="text-sm"
                style={{ fontFamily: 'DM Sans, sans-serif', color: 'oklch(0.50 0.04 165)' }}
              >
                Runde
              </span>
              <span
                className="font-bold text-sm"
                style={{ fontFamily: 'Sora, sans-serif', color: 'oklch(0.30 0.08 165)' }}
              >
                {session.current_round}
              </span>
            </div>
          </div>

          <p
            className="text-sm animate-pulse-slow"
            style={{ fontFamily: 'DM Sans, sans-serif', color: 'oklch(0.55 0.04 165)' }}
          >
            • Fasilitator starter snart •
          </p>
        </div>
      </div>
    );
  }

  // ── State A: Stemmeform ─────────────────────────────────────
  if (!hasVoted) {
    return (
      <div
        className="min-h-screen flex flex-col"
        style={{ background: 'oklch(0.965 0.012 165)' }}
      >
        {/* Header */}
        <div
          className="flex items-center gap-3 px-4 py-4"
          style={{ borderBottom: '1px solid oklch(0.92 0.015 165)' }}
        >
          <button
            type="button"
            onClick={() => { logout(); navigate('/'); }}
            className="flex items-center justify-center w-9 h-9 rounded-xl transition-colors"
            style={{ background: 'oklch(0.92 0.015 165)', color: 'oklch(0.30 0.08 165)' }}
            aria-label="Tilbake"
          >
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
              <path d="M11 4L6 9l5 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          <h1
            className="text-lg font-semibold"
            style={{ fontFamily: 'Sora, sans-serif', color: 'oklch(0.20 0.06 165)' }}
          >
            Deltager
          </h1>
          {session && (
            <span
              className="ml-auto text-xs px-2 py-0.5 rounded-full font-medium"
              style={{
                background: 'oklch(0.92 0.015 165)',
                color: 'oklch(0.40 0.06 165)',
                fontFamily: 'DM Sans, sans-serif',
              }}
            >
              Runde {session.current_round}
            </span>
          )}
        </div>

        {/* Skjema-kort */}
        <div className="flex-1 px-4 py-6 space-y-4">
          <div
            className="bg-white rounded-3xl p-5 space-y-5 animate-fadeUp"
            style={{ boxShadow: '0 2px 20px oklch(0.20 0.06 165 / 0.07)' }}
          >
            <div className="text-center">
              <h2
                className="text-xl font-bold"
                style={{ fontFamily: 'Sora, sans-serif', color: 'oklch(0.20 0.06 165)' }}
              >
                Din stemme
              </h2>
              <p
                className="text-sm mt-1"
                style={{ color: 'oklch(0.55 0.04 165)', fontFamily: 'DM Sans, sans-serif' }}
              >
                Velg størrelse og verdi, og stem
              </p>
              {name && (
                <p
                  className="text-xs mt-0.5"
                  style={{ color: 'oklch(0.60 0.05 165)', fontFamily: 'DM Sans, sans-serif' }}
                >
                  Stemmer som: <strong>{name}</strong>
                </p>
              )}
            </div>

            {/* Størrelse */}
            <div>
              <p
                className="text-sm font-medium mb-2"
                style={{ fontFamily: 'DM Sans, sans-serif', color: 'oklch(0.35 0.05 165)' }}
              >
                Størrelse
              </p>
              <div className="flex gap-2">
                {SIZES.map(({ key, label }) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setSelectedSize(key)}
                    disabled={submitting}
                    aria-pressed={selectedSize === key}
                    className="flex-1 py-3 rounded-xl font-bold text-sm transition-all focus:outline-none"
                    style={{
                      fontFamily: 'Sora, sans-serif',
                      background: selectedSize === key
                        ? 'oklch(0.30 0.08 165)'
                        : 'oklch(0.94 0.015 165)',
                      color: selectedSize === key ? 'white' : 'oklch(0.35 0.05 165)',
                      transform: selectedSize === key ? 'scale(1.04)' : 'scale(1)',
                      boxShadow: selectedSize === key
                        ? '0 2px 10px oklch(0.30 0.08 165 / 0.35)'
                        : 'none',
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {/* Verdi */}
            <div>
              <p
                className="text-sm font-medium mb-2"
                style={{ fontFamily: 'DM Sans, sans-serif', color: 'oklch(0.35 0.05 165)' }}
              >
                Forretningsverdi
              </p>
              <div className="flex gap-2">
                {VALUES.map(({ key, emoji, label, desc }) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setSelectedValue(key)}
                    disabled={submitting}
                    aria-pressed={selectedValue === key}
                    className="flex-1 flex flex-col items-center py-4 rounded-2xl transition-all focus:outline-none"
                    style={{
                      minHeight: '100px',
                      background: selectedValue === key
                        ? 'oklch(0.30 0.08 165)'
                        : 'oklch(0.94 0.015 165)',
                      transform: selectedValue === key ? 'scale(1.04)' : 'scale(1)',
                      boxShadow: selectedValue === key
                        ? '0 2px 10px oklch(0.30 0.08 165 / 0.35)'
                        : 'none',
                    }}
                  >
                    <span className="text-2xl mb-1">{emoji}</span>
                    <span
                      className="text-xs font-bold"
                      style={{
                        fontFamily: 'Sora, sans-serif',
                        color: selectedValue === key ? 'white' : 'oklch(0.30 0.08 165)',
                      }}
                    >
                      {label}
                    </span>
                    <span
                      className="text-xs mt-0.5"
                      style={{
                        fontFamily: 'DM Sans, sans-serif',
                        color: selectedValue === key ? 'white/80' : 'oklch(0.55 0.04 165)',
                        opacity: 0.85,
                      }}
                    >
                      {desc}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {/* Feilmelding */}
            {submitError && (
              <p
                className="text-sm text-center"
                style={{ color: 'oklch(0.52 0.18 25)', fontFamily: 'DM Sans, sans-serif' }}
              >
                {submitError}
              </p>
            )}

            {/* Stem-knapp */}
            <button
              type="button"
              onClick={handleVote}
              disabled={!canVote || submitting}
              className="w-full py-4 rounded-2xl font-bold text-white text-base transition-all focus:outline-none focus:ring-2 focus:ring-offset-2"
              style={{
                fontFamily: 'Sora, sans-serif',
                background: canVote && !submitting
                  ? 'oklch(0.56 0.17 35)'
                  : 'oklch(0.80 0.03 165)',
                cursor: canVote && !submitting ? 'pointer' : 'not-allowed',
                opacity: canVote && !submitting ? 1 : 0.6,
                boxShadow: canVote && !submitting
                  ? '0 2px 12px oklch(0.56 0.17 35 / 0.35)'
                  : 'none',
              }}
            >
              {submitting ? 'Sender…' : 'Stem 🗳️'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── State B: Venter på reveal ───────────────────────────────
  if (!revealed) {
    const myVoteEmoji = selectedValue ? VALUE_MEDAL[selectedValue] : '🗳️';
    return (
      <div
        className="min-h-screen flex flex-col items-center justify-center px-5 py-10"
        style={{ background: 'oklch(0.965 0.012 165)' }}
      >
        <div className="w-full max-w-sm text-center space-y-5">
          {/* Stor medalje */}
          <div className="text-7xl animate-popIn">{myVoteEmoji}</div>

          <div>
            <h2
              className="text-2xl font-bold"
              style={{ fontFamily: 'Sora, sans-serif', color: 'oklch(0.20 0.06 165)' }}
            >
              Stemme registrert!
            </h2>
            <p
              className="mt-2 text-base"
              style={{ fontFamily: 'DM Sans, sans-serif', color: 'oklch(0.45 0.05 165)' }}
            >
              Venter på fasilitator, {name} 👋
            </p>
          </div>

          {/* Oppsummering */}
          <div
            className="bg-white rounded-2xl p-4 space-y-2"
            style={{ boxShadow: '0 2px 16px oklch(0.20 0.06 165 / 0.07)' }}
          >
            <div className="flex justify-between items-center">
              <span
                className="text-sm"
                style={{ fontFamily: 'DM Sans, sans-serif', color: 'oklch(0.50 0.04 165)' }}
              >
                Størrelse
              </span>
              <span
                className="font-bold text-sm uppercase"
                style={{ fontFamily: 'Sora, sans-serif', color: 'oklch(0.30 0.08 165)' }}
              >
                {selectedSize?.toUpperCase()}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span
                className="text-sm"
                style={{ fontFamily: 'DM Sans, sans-serif', color: 'oklch(0.50 0.04 165)' }}
              >
                Verdi
              </span>
              <span className="text-sm">
                {selectedValue ? VALUE_MEDAL[selectedValue] : ''}{' '}
                <span style={{ fontFamily: 'DM Sans, sans-serif', color: 'oklch(0.30 0.08 165)', fontWeight: 600 }}>
                  {selectedValue ? VALUES.find((v) => v.key === selectedValue)?.label : ''}
                </span>
              </span>
            </div>
          </div>

          {/* Puls-animasjon */}
          <p
            className="text-sm animate-pulse-slow"
            style={{ fontFamily: 'DM Sans, sans-serif', color: 'oklch(0.55 0.04 165)' }}
          >
            • Venter på avsløring •
          </p>
        </div>
      </div>
    );
  }

  // ── State C: Resultater ─────────────────────────────────────
  // Sorter stemmer etter størrelse
  const sortedVotes = [...votes].sort(
    (a, b) => SIZE_ORDER[a.size] - SIZE_ORDER[b.size],
  );

  // Konsensus-deteksjon
  const uniqueSizes = new Set(votes.map((v) => v.size));
  const hasConsensus = votes.length > 0 && uniqueSizes.size === 1;
  const consensusSize = hasConsensus ? [...uniqueSizes][0] : null;

  return (
    <div
      className="min-h-screen flex flex-col"
      style={{ background: 'oklch(0.965 0.012 165)' }}
    >
      {/* Header */}
      <div className="px-4 py-5 text-center">
        <div className="text-4xl mb-1">🎊</div>
        <h2
          className="text-2xl font-bold"
          style={{ fontFamily: 'Sora, sans-serif', color: 'oklch(0.20 0.06 165)' }}
        >
          Resultater!
        </h2>
      </div>

      <div className="flex-1 px-4 pb-8 space-y-4">
        {/* Konsensus-banner */}
        {hasConsensus && consensusSize && (
          <div
            className="rounded-2xl px-4 py-3 text-center animate-slideIn"
            style={{ background: 'oklch(0.30 0.08 165)', color: 'white' }}
          >
            <p
              className="text-base font-bold"
              style={{ fontFamily: 'Sora, sans-serif' }}
            >
              🎯 Konsensus — alle stemte {consensusSize.toUpperCase()}!
            </p>
          </div>
        )}

        {/* Stemmekort */}
        <div className="space-y-2">
          {sortedVotes.map((vote) => {
            const isMine = vote.participant_id === localParticipant?.participantId;
            return (
              <div
                key={vote.id}
                className="bg-white rounded-2xl px-4 py-3 flex items-center gap-3 animate-slideIn"
                style={{
                  boxShadow: isMine
                    ? '0 0 0 2px oklch(0.30 0.08 165), 0 2px 12px oklch(0.20 0.06 165 / 0.08)'
                    : '0 1px 8px oklch(0.20 0.06 165 / 0.06)',
                }}
              >
                <span className="text-2xl">{VALUE_MEDAL[vote.value]}</span>
                <span
                  className="flex-1 text-sm font-bold uppercase tracking-wide"
                  style={{ fontFamily: 'Sora, sans-serif', color: 'oklch(0.30 0.08 165)' }}
                >
                  {vote.size.toUpperCase()}
                </span>
                {isMine && (
                  <span
                    className="text-xs px-2 py-0.5 rounded-full font-medium"
                    style={{
                      background: 'oklch(0.30 0.08 165)',
                      color: 'white',
                      fontFamily: 'DM Sans, sans-serif',
                    }}
                  >
                    Din
                  </span>
                )}
              </div>
            );
          })}
        </div>

        {/* Din stemme-reminder */}
        {selectedSize && selectedValue && (
          <div
            className="bg-white rounded-2xl px-4 py-3"
            style={{ boxShadow: '0 1px 8px oklch(0.20 0.06 165 / 0.06)' }}
          >
            <p
              className="text-xs mb-1"
              style={{ fontFamily: 'DM Sans, sans-serif', color: 'oklch(0.55 0.04 165)' }}
            >
              Din stemme
            </p>
            <p
              className="text-sm font-semibold"
              style={{ fontFamily: 'Sora, sans-serif', color: 'oklch(0.20 0.06 165)' }}
            >
              {selectedSize.toUpperCase()} · {VALUE_MEDAL[selectedValue]}{' '}
              {VALUES.find((v) => v.key === selectedValue)?.label}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
