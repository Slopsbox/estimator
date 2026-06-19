import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { SizeSelector } from '../components/SizeSelector';
import { ValueSelector } from '../components/ValueSelector';
import { useSession } from '../hooks/useSession';
import { supabase } from '../lib/supabase';
import type { Size, Value } from '../lib/types';

type VoteStep = 'name' | 'voting' | 'voted';

/**
 * Deltaker-side.
 *
 * Flyt:
 * 1. Spør om navn (om ikke allerede i sessionStorage)
 * 2. Vis stemme-UI (størrelse + verdi)
 * 3. Etter stemming: vis bekreftelse
 * 4. Lytter på current_round via useSession → resetter UI ved ny runde
 */
export function VotePage() {
  const navigate = useNavigate();
  const { session, localParticipant, loading, error, joinSession, logout } = useSession();

  const [step, setStep] = useState<VoteStep>('name');
  const [nameInput, setNameInput] = useState('');
  const [nameError, setNameError] = useState<string | null>(null);
  const [joining, setJoining] = useState(false);

  const [selectedSize, setSelectedSize] = useState<Size | null>(null);
  const [selectedValue, setSelectedValue] = useState<Value | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Holder styr på forrige runde for å detektere endring
  const prevRoundRef = useRef<number | null>(null);

  // Hvis vi allerede har localParticipant fra sessionStorage → gå direkte til voting
  useEffect(() => {
    if (localParticipant && session) {
      setStep('voting');
    }
  }, [localParticipant, session]);

  // Lytt på rundeendring → reset UI
  useEffect(() => {
    if (!session) return;
    if (prevRoundRef.current === null) {
      prevRoundRef.current = session.current_round;
      return;
    }
    if (session.current_round !== prevRoundRef.current) {
      prevRoundRef.current = session.current_round;
      // Reset stemme-UI
      setSelectedSize(null);
      setSelectedValue(null);
      setSubmitError(null);
      setStep('voting');
    }
  }, [session?.current_round]);

  // Sesjon avsluttet → tilbake til landing
  useEffect(() => {
    if (session?.status === 'completed') {
      alert('Sesjonen er avsluttet av fasilitator.');
      logout();
      navigate('/');
    }
  }, [session?.status, logout, navigate]);

  const handleJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = nameInput.trim();
    if (!name) {
      setNameError('Skriv inn et navn for å fortsette.');
      return;
    }
    setNameError(null);
    setJoining(true);
    const ok = await joinSession(name);
    setJoining(false);
    if (ok) {
      setStep('voting');
    }
  };

  const handleVote = async () => {
    if (!selectedSize || !selectedValue || !localParticipant || !session) return;

    setSubmitting(true);
    setSubmitError(null);

    const { error: voteError } = await supabase.from('votes').insert({
      session_id: localParticipant.sessionId,
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

    setStep('voted');
  };

  // ── Navn-steg ──────────────────────────────────────────────
  if (step === 'name') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="w-full max-w-sm bg-white rounded-2xl shadow-sm border border-gray-100 p-8 space-y-6">
          <div className="text-center">
            <div className="text-4xl mb-3">👤</div>
            <h1 className="text-2xl font-bold text-gray-900">Bli med</h1>
            <p className="mt-1 text-sm text-gray-500">Skriv inn navnet ditt for å delta</p>
          </div>

          <form onSubmit={handleJoin} className="space-y-4">
            <div>
              <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-1">
                Navn
              </label>
              <input
                id="name"
                type="text"
                value={nameInput}
                onChange={(e) => setNameInput(e.target.value)}
                placeholder="Ditt navn"
                maxLength={60}
                autoFocus
                className="w-full px-4 py-3 rounded-lg border border-gray-300 text-gray-900 
                           focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
              {nameError && <p className="mt-1 text-sm text-red-600">{nameError}</p>}
              {error && <p className="mt-1 text-sm text-red-600">{error}</p>}
            </div>

            <button
              type="submit"
              disabled={joining || loading}
              className={[
                'w-full py-3 px-6 rounded-xl font-semibold text-white transition-all',
                'focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500',
                joining || loading
                  ? 'bg-blue-300 cursor-not-allowed'
                  : 'bg-blue-600 hover:bg-blue-700 active:scale-95',
              ].join(' ')}
            >
              {joining || loading ? 'Kobler til…' : 'Bli med'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  // ── Stemt ──────────────────────────────────────────────────
  if (step === 'voted') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="w-full max-w-sm bg-white rounded-2xl shadow-sm border border-gray-100 p-8 text-center space-y-4">
          <div className="text-6xl">✓</div>
          <h2 className="text-2xl font-bold text-green-700">Stemme registrert!</h2>
          <p className="text-gray-500 text-sm">
            Vent til fasilitator starter en ny runde.
          </p>
          {session && (
            <p className="text-xs text-gray-400">Runde {session.current_round}</p>
          )}
        </div>
      </div>
    );
  }

  // ── Stemme-UI ──────────────────────────────────────────────
  const canVote = selectedSize !== null && selectedValue !== null;

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="max-w-lg mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between pt-4">
          <div>
            <h1 className="text-xl font-bold text-gray-900">
              Hei, {localParticipant?.name ?? ''}!
            </h1>
            {session && (
              <p className="text-sm text-gray-500">Runde {session.current_round}</p>
            )}
          </div>
          <button
            type="button"
            onClick={() => { logout(); navigate('/'); }}
            className="text-xs text-gray-400 hover:text-gray-600 underline"
          >
            Forlat
          </button>
        </div>

        {/* Størrelse */}
        <div className="bg-white rounded-2xl border border-gray-100 p-6 space-y-4">
          <h2 className="font-semibold text-gray-700 text-center">Velg størrelse</h2>
          <SizeSelector
            selected={selectedSize}
            onChange={setSelectedSize}
            disabled={submitting}
          />
        </div>

        {/* Verdi */}
        <div className="bg-white rounded-2xl border border-gray-100 p-6 space-y-4">
          <h2 className="font-semibold text-gray-700 text-center">Velg forretningsverdi</h2>
          <ValueSelector
            selected={selectedValue}
            onChange={setSelectedValue}
            disabled={submitting}
          />
        </div>

        {/* Stem-knapp */}
        {submitError && (
          <p className="text-sm text-red-600 text-center">{submitError}</p>
        )}
        <button
          type="button"
          onClick={handleVote}
          disabled={!canVote || submitting}
          className={[
            'w-full py-4 rounded-xl font-bold text-lg transition-all',
            'focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500',
            canVote && !submitting
              ? 'bg-blue-600 text-white hover:bg-blue-700 active:scale-95 shadow-md'
              : 'bg-gray-200 text-gray-400 cursor-not-allowed',
          ].join(' ')}
        >
          {submitting ? 'Sender…' : 'Stem 🗳️'}
        </button>
      </div>
    </div>
  );
}
