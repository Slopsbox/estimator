import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { VoteAwaitReveal } from '../components/vote/VoteAwaitReveal';
import { VoteForm } from '../components/vote/VoteForm';
import { VoteResults } from '../components/vote/VoteResults';
import { VoteWaiting } from '../components/vote/VoteWaiting';
import { useConfetti } from '../hooks/useConfetti';
import { useRealtimeVotes } from '../hooks/useRealtimeVotes';
import { useSession } from '../hooks/useSession';
import { useSessionPresence } from '../hooks/useSessionPresence';
import { useWakeLock } from '../hooks/useWakeLock';
import { readLastUsedName } from '../lib/localStorage';
import { resolveRoomRoute } from '../lib/roomRoutes';
import type { Size, Value } from '../lib/types';

function isSize(value: string): value is Size {
  return value === 'xs' || value === 's' || value === 'm' || value === 'l' || value === 'xl';
}

function isValue(value: string): value is Value {
  return value === 'gold' || value === 'silver' || value === 'bronze';
}

export function VotePage() {
  const navigate = useNavigate();
  const {
    session,
    localParticipant,
    ownVote,
    roundParticipant,
    restoreStatus,
    logout,
    leaveSession,
    claimRound,
    castVote,
    retractVote,
  } = useSession();
  const { triggerConfetti } = useConfetti();
  useWakeLock();
  useSessionPresence(session?.id ?? null, localParticipant?.participantId ?? null);

  const name = localParticipant?.name || readLastUsedName();
  const [selectedSize, setSelectedSize] = useState<Size | null>(null);
  const [selectedValue, setSelectedValue] = useState<Value | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [claimRetry, setClaimRetry] = useState(0);
  const claimKeyRef = useRef<string | null>(null);
  const confettiTriggeredRef = useRef(false);

  const { votes, ownVote: realtimeOwnVote, revealed } = useRealtimeVotes(
    session?.id ?? null,
    session?.current_round ?? 1,
    session?.votes_revealed ?? false,
    localParticipant?.participantId,
  );
  const [suppressRealtimeVote, setSuppressRealtimeVote] = useState(false);
  const effectiveOwnVote = ownVote ?? (suppressRealtimeVote ? null : realtimeOwnVote);

  useEffect(() => {
    if (revealed && effectiveOwnVote && !confettiTriggeredRef.current) {
      confettiTriggeredRef.current = true;
      triggerConfetti();
    }
    if (!revealed) confettiTriggeredRef.current = false;
  }, [revealed, effectiveOwnVote, triggerConfetti]);

  useEffect(() => {
    if (!session || !session.started || session.votes_revealed || roundParticipant) return;
    const claimKey = `${session.id}:${session.current_round}`;
    if (claimKeyRef.current === claimKey) return;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    let active = true;
    void claimRound().then((result) => {
      if (!active) return;
      if (result.ok) claimKeyRef.current = claimKey;
      else retryTimer = setTimeout(() => setClaimRetry((attempt) => attempt + 1), 2000);
    });
    return () => {
      active = false;
      if (retryTimer) clearTimeout(retryTimer);
    };
  }, [claimRound, claimRetry, roundParticipant, session]);

  useEffect(() => {
    if (localParticipant?.role === 'facilitator') navigate(resolveRoomRoute('estimation', 'facilitator'));
  }, [localParticipant?.role, navigate]);

  useEffect(() => {
    if (session?.status === 'completed') {
      logout();
      navigate('/');
    }
  }, [session?.status, logout, navigate]);

  useEffect(() => {
    if ((restoreStatus === 'ready' || restoreStatus === 'invalid') && !session && !localParticipant) {
      navigate(resolveRoomRoute('estimation', 'join'));
    }
  }, [restoreStatus, session, localParticipant, navigate]);

  const handleVote = async () => {
    if (!selectedSize || !selectedValue) return;
    setSubmitting(true);
    setSubmitError(null);
    const result = await castVote({ size: selectedSize, value: selectedValue });
    setSubmitting(false);
    if (!result.ok) setSubmitError(result.message);
    else setSuppressRealtimeVote(false);
  };

  const handleAmalie = async () => {
    if (!effectiveOwnVote || roundParticipant?.reestimate_used || revealed) return;
    setSubmitError(null);
    const result = await retractVote();
    if (!result.ok) {
      setSubmitError(result.message);
      return;
    }
    setSelectedSize(null);
    setSelectedValue(null);
    setSuppressRealtimeVote(true);
  };

  const handleLeave = async () => {
    const result = await leaveSession();
    if (!result.ok) {
      setSubmitError(result.message);
      return;
    }
    navigate('/');
  };

  if (!session && (restoreStatus === 'initializing' || restoreStatus === 'reconnecting')) {
    return <div className="min-h-screen flex items-center justify-center">{restoreStatus === 'initializing' ? 'Gjenoppretter sesjon…' : 'Kobler til sesjonen på nytt…'}</div>;
  }

  if (session && !session.started) return <VoteWaiting session={session} name={name} onLeave={() => { void handleLeave(); }} />;

  if (revealed) {
    return (
      <VoteResults
        name={name}
        votes={votes}
        selectedSize={effectiveOwnVote && isSize(effectiveOwnVote.size) ? effectiveOwnVote.size : null}
        selectedValue={effectiveOwnVote && isValue(effectiveOwnVote.value) ? effectiveOwnVote.value : null}
        localParticipant={localParticipant}
        consensusStreak={session?.consensus_streak ?? 0}
        currentRound={session?.current_round}
        onLeave={() => { void handleLeave(); }}
      />
    );
  }

  if (effectiveOwnVote) {
    return (
      <VoteAwaitReveal
        name={name}
        selectedSize={isSize(effectiveOwnVote.size) ? effectiveOwnVote.size : 'm'}
        selectedValue={isValue(effectiveOwnVote.value) ? effectiveOwnVote.value : 'silver'}
        currentRound={session?.current_round}
        hasUsedAmalie={roundParticipant?.reestimate_used ?? false}
        onAmalie={handleAmalie}
        error={submitError}
        onLeave={() => { void handleLeave(); }}
      />
    );
  }

  return (
    <VoteForm
      name={name}
      currentRound={session?.current_round ?? 1}
      selectedSize={selectedSize}
      selectedValue={selectedValue}
      submitting={submitting}
      canSubmit={Boolean(roundParticipant)}
      submitError={submitError}
      onSelectSize={setSelectedSize}
      onSelectValue={setSelectedValue}
      onVote={handleVote}
      onBack={() => { void handleLeave(); }}
    />
  );
}
