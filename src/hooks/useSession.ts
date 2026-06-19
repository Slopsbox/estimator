import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import type { LocalParticipant, ParticipantRole, Session } from '../lib/types';

const STORAGE_KEY = 'estimering_participant';

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
 * - Fasilitator: avslutter aktiv sesjon og oppretter ny
 * - Deltaker: finner aktiv sesjon og kobler til
 * - Lagrer participant_id i sessionStorage for å overleve refresh
 * - Abonnerer på realtime-oppdateringer på sessions-tabellen
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

  /** Lytt på sesjonsendringer (ny runde, status) */
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
   * Eksisterende aktiv sesjon settes til 'completed' først.
   */
  const createSession = useCallback(async (facilitatorName: string): Promise<Session | null> => {
    setLoading(true);
    setError(null);

    // Sett evt. eksisterende aktive sesjoner til 'completed'
    await supabase
      .from('sessions')
      .update({ status: 'completed' })
      .eq('status', 'active');

    // Opprett ny sesjon
    const { data: sessionData, error: sessionError } = await supabase
      .from('sessions')
      .insert({ status: 'active', current_round: 1 })
      .select()
      .single();

    if (sessionError || !sessionData) {
      setError('Kunne ikke opprette sesjon. Prøv igjen.');
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
      sessionId: sessionData.id as string,
      name: facilitatorName,
      role: 'facilitator',
    };

    writeToStorage(local);
    setLocalParticipant(local);
    setSession(sessionData as Session);
    setLoading(false);
    return sessionData as Session;
  }, []);

  /**
   * Join aktiv sesjon som deltaker.
   */
  const joinSession = useCallback(async (name: string): Promise<boolean> => {
    setLoading(true);
    setError(null);

    // Finn aktiv sesjon (MVP: én aktiv sesjon)
    const { data: sessionData, error: sessionError } = await supabase
      .from('sessions')
      .select('*')
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (sessionError || !sessionData) {
      setError('Ingen aktiv sesjon funnet. Vent til fasilitator starter en ny.');
      setLoading(false);
      return false;
    }

    // Sjekk om deltaker allerede er med (ved navn-kollisjon)
    const { data: existing } = await supabase
      .from('participants')
      .select('id')
      .eq('session_id', sessionData.id)
      .eq('name', name)
      .single();

    let participantId: string;

    if (existing) {
      // Deltaker finnes allerede – gjenopprett
      participantId = existing.id as string;
    } else {
      const { data: participantData, error: participantError } = await supabase
        .from('participants')
        .insert({
          session_id: sessionData.id,
          name,
          role: 'participant' as ParticipantRole,
        })
        .select()
        .single();

      if (participantError || !participantData) {
        setError('Kunne ikke bli med i sesjonen. Prøv igjen.');
        setLoading(false);
        return false;
      }
      participantId = participantData.id as string;
    }

    const local: LocalParticipant = {
      participantId,
      sessionId: sessionData.id as string,
      name,
      role: 'participant',
    };

    writeToStorage(local);
    setLocalParticipant(local);
    setSession(sessionData as Session);
    setLoading(false);
    return true;
  }, []);

  /** Inkrementér rundenummer (fasilitator) */
  const nextRound = useCallback(async (): Promise<void> => {
    if (!session) return;

    const { error: err } = await supabase
      .from('sessions')
      .update({ current_round: session.current_round + 1 })
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
    nextRound,
    endSession,
    logout,
  };
}
