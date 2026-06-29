import { useCallback, useEffect, useRef, useState } from 'react';
import { generateJoinCode } from '../lib/joinCode';
import { supabase } from '../lib/supabase';
import type { LocalParticipant, ParticipantRole, Session } from '../lib/types';
import { useVisibilityRefetch } from './useVisibilityRefetch';

const STORAGE_KEY_PREFIX = 'estimat_session_';

function getStorageKey(sessionId: string): string {
  return `${STORAGE_KEY_PREFIX}${sessionId}`;
}

function readFromStorage(): LocalParticipant | null {
  // Iterer over localStorage og finn nøkler som starter med prefix
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key?.startsWith(STORAGE_KEY_PREFIX)) {
      try {
        const data = JSON.parse(localStorage.getItem(key) ?? '') as LocalParticipant;
        return data;
      } catch {
        localStorage.removeItem(key!);
      }
    }
  }
  return null;
}

function writeToStorage(local: LocalParticipant): void {
  // Rydd opp gamle sesjoner først
  clearOldStorage(local.sessionId);
  localStorage.setItem(getStorageKey(local.sessionId), JSON.stringify(local));
}

function clearStorage(): void {
  for (let i = localStorage.length - 1; i >= 0; i--) {
    const key = localStorage.key(i);
    if (key?.startsWith(STORAGE_KEY_PREFIX)) {
      localStorage.removeItem(key);
    }
  }
}

function clearOldStorage(keepSessionId: string): void {
  for (let i = localStorage.length - 1; i >= 0; i--) {
    const key = localStorage.key(i);
    if (key?.startsWith(STORAGE_KEY_PREFIX) && key !== getStorageKey(keepSessionId)) {
      localStorage.removeItem(key);
    }
  }
}

/**
 * Håndterer sesjonshåndtering for estimeringsappen.
 *
 * - Fasilitator: oppretter ny sesjon med join_code
 * - Deltaker: finner sesjon via join_code og kobler til
 * - Lagrer participant_id i localStorage (med session-scope) for å overleve refresh
 * - Abonnerer på realtime-oppdateringer på sessions-tabellen (inkl. votes_revealed)
 * - Re-fetcher sesjonstate ved tab-bytte/nettverksgjenoppretting (useVisibilityRefetch)
 */
export function useSession() {
  const [session, setSession] = useState<Session | null>(null);
  const [localParticipant, setLocalParticipant] = useState<LocalParticipant | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // initialized er false inntil gjenopprettings-effecten er forsøkt ferdig.
  // Vote.tsx bruker denne for å unngå prematur redirect til /join.
  const [initialized, setInitialized] = useState(false);

  // Ref for å unngå dobbel gjenoppretting
  const restoredRef = useRef(false);

  /** Gjenopprett sesjon fra localStorage ved refresh */
  useEffect(() => {
    if (restoredRef.current) return;
    restoredRef.current = true;

    const local = readFromStorage();
    if (!local) {
      // Ingen lagret data – vi er ferdig med gjenoppretting
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setInitialized(true);
      return;
    }

    setLocalParticipant(local);

    // Hent aktiv sesjonsinformasjon fra DB
    void supabase
      .from('sessions')
      .select('*')
      .eq('id', local.sessionId)
      .single()
      .then(({ data, error: err }) => {
        if (err || !data) {
          clearStorage();
          setLocalParticipant(null);
        } else {
          setSession(data);
        }
        // Gjenoppretting er forsøkt ferdig uansett utfall
        setInitialized(true);
      });
  }, []);

  /** Re-fetch sesjon fra DB ved tab-bytte eller nettverksgjenoppretting */
  const sessionId = session?.id ?? null;

  const refetchSession = useCallback(async () => {
    if (!sessionId) return;
    const { data } = await supabase
      .from('sessions')
      .select('*')
      .eq('id', sessionId)
      .single();
    if (data) {
      setSession(data);
    }
  }, [sessionId]);

  useVisibilityRefetch(refetchSession);

  /** Lytt på sesjonsendringer (ny runde, status, votes_revealed, started) */
  useEffect(() => {
    if (!sessionId) return;

    const channel = supabase
      .channel(`session-watch:${sessionId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'sessions',
          filter: `id=eq.${sessionId}`,
        },
        (payload) => {
          setSession(payload.new as Session);
        },
      )
      .subscribe((_status) => {
        // subscription status
      });

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [sessionId]);



  /**
   * Opprett ny sesjon som fasilitator.
   * Genererer unik 4-tegns join_code.
   */
  const createSession = useCallback(async (facilitatorName: string): Promise<Session | null> => {
    setLoading(true);
    setError(null);

    // Generer unik join_code (prøv inntil 10 ganger ved kollisjon)
    let sessionData: Session | null = null;

    for (let attempt = 0; attempt < 10; attempt++) {
      const joinCode = generateJoinCode();

      const { data, error: sessionError } = await supabase
        .from('sessions')
        .insert({
          status: 'active',
          current_round: 1,
          join_code: joinCode,
          votes_revealed: false,
          started: false,
          consensus_streak: 0,
        })
        .select()
        .single();

      if (!sessionError && data) {
        sessionData = data;
        break;
      }

      // 23505 = unique constraint violation (join_code kolliderte)
      if (sessionError?.code !== '23505') {
        setError('Kunne ikke opprette sesjon. Prøv igjen.');
        setLoading(false);
        return null;
      }
    }

    if (!sessionData) {
      setError('Kunne ikke generere unik sesjonskode. Prøv igjen.');
      setLoading(false);
      return null;
    }

    // Registrer fasilitator som deltaker
    const { data: participantData, error: participantError } = await supabase
      .from('participants')
      .insert({
        session_id: sessionData.id,
        name: facilitatorName,
        role: 'facilitator' satisfies ParticipantRole,
      })
      .select()
      .single();

    if (participantError || !participantData) {
      setError('Kunne ikke registrere fasilitator. Prøv igjen.');
      setLoading(false);
      return null;
    }

    const local: LocalParticipant = {
      participantId: participantData.id,
      sessionId: sessionData.id,
      name: facilitatorName,
      role: 'facilitator',
    };

    writeToStorage(local);
    setLocalParticipant(local);
    setSession(sessionData);
    setLoading(false);
    return sessionData;
  }, []);

  /**
   * Join sesjon via join_code som deltaker.
   * Tar navn som parameter – gjenbruker eksisterende deltaker ved duplikat (upsert-logikk).
   */
  const joinSession = useCallback(async (code: string, name: string): Promise<boolean> => {
    setLoading(true);
    setError(null);

    const normalizedCode = code.trim().toUpperCase();
    const trimmedName = name.trim() || 'Anonym';

    // Finn sesjon via join_code – bruker eq for eksakt match.
    // join_code genereres alltid som uppercase, og normalizedCode er også uppercase,
    // så eq er tryggere og mer forutsigbart enn ilike for dette formålet.
    const { data: sessionData, error: sessionError } = await supabase
      .from('sessions')
      .select('*')
      .eq('join_code', normalizedCode)
      .eq('status', 'active')
      .single();

    if (sessionError || !sessionData) {
      console.error('[joinSession] Fant ikke sesjon med kode:', normalizedCode, sessionError?.code);
      setError('Feil kode — prøv igjen.');
      setLoading(false);
      return false;
    }

    // Sjekk om deltaker med samme navn allerede finnes i sesjonen (upsert-logikk)
    const { data: existing } = await supabase
      .from('participants')
      .select('*')
      .eq('session_id', sessionData.id)
      .eq('name', trimmedName)
      .single();

    if (existing) {
      // Gjenbruk eksisterende deltaker – unngår duplikat-rad
      const local: LocalParticipant = {
        participantId: existing.id,
        sessionId: sessionData.id,
        name: trimmedName,
        role: existing.role as ParticipantRole,
      };
      // Lagre navn i localStorage for fremtidige runder
      localStorage.setItem(`${STORAGE_KEY_PREFIX}vote_name`, trimmedName);
      writeToStorage(local);
      setLocalParticipant(local);
      setSession(sessionData);
      setLoading(false);
      return true;
    }

    // Registrer ny deltaker
    const { data: participantData, error: participantError } = await supabase
      .from('participants')
      .insert({
        session_id: sessionData.id,
        name: trimmedName,
        role: 'participant' satisfies ParticipantRole,
      })
      .select()
      .single();

    if (participantError || !participantData) {
      console.error('[joinSession] Kunne ikke registrere deltaker:', participantError?.code);
      setError('Kunne ikke bli med i sesjonen. Prøv igjen.');
      setLoading(false);
      return false;
    }

    const local: LocalParticipant = {
      participantId: participantData.id,
      sessionId: sessionData.id,
      name: trimmedName,
      role: 'participant',
    };

    // Lagre navn i localStorage for fremtidige runder
    localStorage.setItem(`${STORAGE_KEY_PREFIX}vote_name`, trimmedName);

    writeToStorage(local);
    setLocalParticipant(local);
    setSession(sessionData);
    setLoading(false);
    return true;
  }, []);

  /**
   * Oppdater deltaker-navn etter join (brukes i Vote-siden).
   */
  const updateParticipantName = useCallback(async (name: string): Promise<boolean> => {
    const local = readFromStorage();
    if (!local) return false;

    const { error: err } = await supabase
      .from('participants')
      .update({ name })
      .eq('id', local.participantId);

    if (err) return false;

    const updated: LocalParticipant = { ...local, name };
    writeToStorage(updated);
    setLocalParticipant(updated);
    return true;
  }, []);

  /**
   * Start sesjon (fasilitator) – setter started = true.
   */
  const startSession = useCallback(async (): Promise<void> => {
    if (!session) return;

    const { error: err } = await supabase
      .from('sessions')
      .update({ started: true })
      .eq('id', session.id);

    if (err) {
      setError('Kunne ikke starte sesjonen. Prøv igjen.');
    }
  }, [session]);

  /**
   * Avslør stemmer (fasilitator).
   * Oppdaterer samtidig consensus_streak:
   *   - Konsensus (alle stemte likt): streak + 1
   *   - Ikke konsensus: streak nullstilles til 0
   */
  const revealVotes = useCallback(async (currentVotes: Array<{ size: string }>): Promise<void> => {
    if (!session) return;

    const uniqueSizes = new Set(currentVotes.map((v) => v.size));
    const isConsensus = currentVotes.length > 0 && uniqueSizes.size === 1;

    // Beregn ny streak
    const newStreak = isConsensus ? (session.consensus_streak + 1) : 0;

    const { error: err } = await supabase
      .from('sessions')
      .update({ votes_revealed: true, consensus_streak: newStreak })
      .eq('id', session.id);

    if (err) {
      setError('Kunne ikke avsløre stemmer. Prøv igjen.');
    }
  }, [session]);

  /**
   * Inkrementér rundenummer og nullstill reveal (fasilitator).
   */
  const nextRound = useCallback(async (): Promise<void> => {
    if (!session) return;

    const { error: err } = await supabase
      .from('sessions')
      .update({
        current_round: session.current_round + 1,
        votes_revealed: false,
      })
      .eq('id', session.id);

    if (err) {
      setError('Kunne ikke starte ny runde. Prøv igjen.');
    }
  }, [session]);

  /** Avslutt sesjon (fasilitator) */
  const endSession = useCallback(async (): Promise<void> => {
    if (!session) return;

    const { error: err } = await supabase
      .from('sessions')
      .update({ status: 'completed' })
      .eq('id', session.id);

    if (err) {
      setError('Kunne ikke avslutte sesjonen. Prøv igjen.');
    }
  }, [session]);

  /** Logg ut (fjern lagret deltaker-info) */
  const logout = useCallback((): void => {
    clearStorage();
    setLocalParticipant(null);
    setSession(null);
  }, []);

  return {
    session,
    localParticipant,
    loading,
    error,
    initialized,
    createSession,
    joinSession,
    startSession,
    updateParticipantName,
    revealVotes,
    nextRound,
    endSession,
    logout,
  };
}
