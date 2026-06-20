import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { VoteAwaitReveal } from '../components/vote/VoteAwaitReveal';
import { VoteForm } from '../components/vote/VoteForm';
import { VoteResults } from '../components/vote/VoteResults';
import { VoteWaiting } from '../components/vote/VoteWaiting';
import { useConfetti } from '../hooks/useConfetti';
import { useRealtimeVotes } from '../hooks/useRealtimeVotes';
import { useSession } from '../hooks/useSession';
import { supabase } from '../lib/supabase';
import type { Size, Value } from '../lib/types';

/**
 * Deltaker Vote-side – fire states:
 * W) Venter på fasilitator (session.started === false)
 * A) notVoted: stemmeform
 * B) hasVoted && !revealed: venter på avsløring
 * C) hasVoted && revealed: vis resultater med konfetti
 */
export function VotePage() {
  const navigate = useNavigate();
  const { session, localParticipant, logout, initialized } = useSession();
  const { triggerConfetti } = useConfetti();

  // Navn hentes fra sessionStorage (satt ved join)
  const name = sessionStorage.getItem('estimering_vote_name') ?? localParticipant?.name ?? '';

  const [selectedSize, setSelectedSize] = useState<Size | null>(null);
  const [selectedValue, setSelectedValue] = useState<Value | null>(null);
  const [hasVoted, setHasVoted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Sanntids-stemmer og revealed via useRealtimeVotes
  const { votes, revealed } = useRealtimeVotes(
    session?.id ?? null,
    session?.current_round ?? 1,
    session?.votes_revealed ?? false,
  );

  // Konfetti trigges kun én gang per reveal
  const confettiTriggeredRef = useRef(false);
  // Runde-tracking for reset
  const prevRoundRef = useRef<number | null>(null);

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
    }
  }, [session?.current_round]);

  // Sesjon avsluttet
  useEffect(() => {
    if (session?.status === 'completed') {
      logout();
      navigate('/');
    }
  }, [session?.status, logout, navigate]);

  // Redirect til join hvis ingen sesjon – men BARE etter at gjenoppretting er forsøkt.
  useEffect(() => {
    if (initialized && !session && !localParticipant) {
      navigate('/join');
    }
  }, [initialized, session, localParticipant, navigate]);

  const handleVote = async () => {
    if (!selectedSize || !selectedValue || !session || !localParticipant) return;

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
    // Realtime (INSERT) fanger opp stemmen automatisk innen noen ms
  };

  // ── State W: Venter på fasilitator ─────────────────────────
  if (session && !session.started) {
    return <VoteWaiting session={session} name={name} />;
  }

  // ── State A: Stemmeform ─────────────────────────────────────
  if (!hasVoted) {
    return (
      <VoteForm
        name={name}
        currentRound={session?.current_round ?? 1}
        selectedSize={selectedSize}
        selectedValue={selectedValue}
        submitting={submitting}
        submitError={submitError}
        onSelectSize={setSelectedSize}
        onSelectValue={setSelectedValue}
        onVote={handleVote}
        onBack={() => { logout(); navigate('/'); }}
      />
    );
  }

  // ── State B: Venter på reveal ───────────────────────────────
  if (!revealed) {
    return (
      <VoteAwaitReveal
        name={name}
        selectedSize={selectedSize!}
        selectedValue={selectedValue!}
      />
    );
  }

  // ── State C: Resultater ─────────────────────────────────────
  return (
    <VoteResults
      name={name}
      votes={votes}
      selectedSize={selectedSize}
      selectedValue={selectedValue}
      localParticipant={localParticipant}
    />
  );
}
