import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import type { LocalParticipant, ParticipantRole, Session } from '../lib/types';

const STORAGE_KEY = 'estimering_participant';

// Tegn som er tillatt i join-kode: A-Z unntatt I og O, 2-9 unntatt 0 og 1
const JOIN_CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function generateJoinCode(): string {
  let code = '';
  for (let i = 0; i < 4; i++) {
    code += JOIN_CODE_CHARS[Math.floor(Math.random() * JOIN_CODE_CHARS.length)];
  }
  return code;
}

function readFromStorage(): LocalParticipant | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as LocalParticipant;
  } catch {
    sessionStorage.removeItem(STORAGE_KEY);
    return null;
  }
}

function writeToStorage(local: LocalParticipant): void {
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(local));
}

function clearStorage(): void {
  sessionStorage.removeItem(STORAGE_KEY);
}

/**
 * Håndterer sesjonshåndtering for estimeringsappen.
 *
 * - Fasilitator: oppretter ny sesjon med join_code
 * - Deltaker: finner sesjon via join_code og kobler til
 * - Lagrer participant_id i sessionStorage for å overleve refresh
 * - Abonnerer på realtime-oppdateringer på sessions-tabellen (inkl. votes_revealed)
 */
export function useSession() {
  const [session, setSession] = useState<Session | null>(null);
  const [localParticipant, setLocalParticipant] = useState<LocalParticipant | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Ref for å unngå dobbel gjenoppretting
  const restoredRef = useRef(false);

  /** Gjenopprett sesjon fra sessionStorage ved refresh */
  useEffect(() => {
    if (restoredRef.current) return;
    restoredRef.current = true;

    const local = readFromStorage();
    if (!local) return;

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
          return;
        }
        setSession(data as Session);
      });
  }, []);

  /** Lytt på sesjonsendringer (ny runde, status, votes_revealed) */
  useEffect(() => {
    if (!session) return;

    const channel = supabase
      .channel(`session-watch:${session.id}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'sessions',
          filter: `id=eq.${session.id}`,
        },
        (payload) => {
          setSession(payload.new as Session);
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [session?.id]);

  /**
   * Opprett ny sesjon som fasilitator.
   * Eksisterende aktive sesjoner settes til 'completed' først.
   * Genererer unik 4-tegns join_code.
   */
  const createSession = useCallback(async (facilitatorName: string): Promise<Session | null> => {
    setLoading(true);
    setError(null);

    // Sett evt. eksisterende aktive sesjoner til 'completed'
    await supabase
      .from('sessions')
      .update({ status: 'completed' })
      .eq('status', 'active');

    // Generer unik join_code (prøv inntil 10 ganger ved kollisjon)
    let joinCode = '';
    let sessionData: Session | null = null;

    for (let attempt = 0; attempt < 10; attempt++) {
      joinCode = generateJoinCode();

      const { data, error: sessionError } = await supabase
        .from('sessions')
        .insert({
          status: 'active',
          current_round: 1,
          join_code: joinCode,
          votes_revealed: false,
          started: false,
        })
        .select()
        .single();

      if (!sessionError && data) {
        sessionData = data as Session;
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
        role: 'facilitator' as ParticipantRole,
      })
      .select()
      .single();

    if (participantError || !participantData) {
      setError('Kunne ikke registrere fasilitator. Prøv igjen.');
      setLoading(false);
      return null;
    }

    const local: LocalParticipant = {
      participantId: participantData.id as string,
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
   * Tar navn som parameter – registrerer deltaker med riktig navn med én gang.
   */
  const joinSession = useCallback(async (code: string, name: string): Promise<boolean> => {
    setLoading(true);
    setError(null);

    const normalizedCode = code.trim().toUpperCase();
    const trimmedName = name.trim() || 'Anonym';

    // Finn sesjon via join_code
    const { data: sessionData, error: sessionError } = await supabase
      .from('sessions')
      .select('*')
      .eq('join_code', normalizedCode)
      .eq('status', 'active')
      .single();

    if (sessionError || !sessionData) {
      setError('Feil kode — prøv igjen.');
      setLoading(false);
      return false;
    }

    // Sjekk om deltaker allerede er med (ved navn-kollisjon, ikke aktuelt her)
    // Registrer ny deltaker
    const { data: participantData, error: participantError } = await supabase
      .from('participants')
      .insert({
        session_id: sessionData.id,
        name: trimmedName,
        role: 'participant' as ParticipantRole,
      })
      .select()
      .single();

    if (participantError || !participantData) {
      setError('Kunne ikke bli med i sesjonen. Prøv igjen.');
      setLoading(false);
      return false;
    }

    const local: LocalParticipant = {
      participantId: participantData.id as string,
      sessionId: sessionData.id as string,
      name: trimmedName,
      role: 'participant',
    };

    // Lagre navn i sessionStorage for fremtidige runder
    sessionStorage.setItem('estimering_vote_name', trimmedName);

    writeToStorage(local);
    setLocalParticipant(local);
    setSession(sessionData as Session);
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
   */
  const revealVotes = useCallback(async (): Promise<void> => {
    if (!session) return;

    const { error: err } = await supabase
      .from('sessions')
      .update({ votes_revealed: true })
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
