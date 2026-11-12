import { useMutation, useQueryClient } from '@tanstack/react-query';

import { cleanName } from '@/domain/categories';
import type { Category } from '@/lib/queries';
import { supabase } from '@/lib/supabase';

/** These changes can move money between envelopes and rename transactions. */
function useInvalidate() {
  const queryClient = useQueryClient();
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ['envelopes'] }),
      queryClient.invalidateQueries({ queryKey: ['categories'] }),
      queryClient.invalidateQueries({ queryKey: ['budget'] }),
      queryClient.invalidateQueries({ queryKey: ['transactions'] }),
    ]);
}

function useChange<Args, Result = unknown>(fn: (args: Args) => PromiseLike<{ data?: Result | null; error: unknown }>) {
  const invalidate = useInvalidate();
  return useMutation({
    async mutationFn(args: Args) {
      const { data, error } = await fn(args);
      if (error) throw error;
      return data as Result;
    },
    onSuccess: invalidate,
  });
}

const named = <T extends { name?: string }>(changes: T): T =>
  changes.name === undefined ? changes : { ...changes, name: cleanName(changes.name) };

// Envelopes ---------------------------------------------------------------------

/** New envelopes go to the end of their group. */
export const useCreateEnvelope = () =>
  useChange((e: { householdId: string; groupId: string; name: string; sortOrder: number }) =>
    supabase.from('envelopes').insert({
      household_id: e.householdId,
      group_id: e.groupId,
      name: cleanName(e.name),
      sort_order: e.sortOrder,
    }),
  );

export const useUpdateEnvelope = () =>
  useChange(
    ({
      id,
      changes,
    }: {
      id: string;
      changes: { name?: string; hidden?: boolean; group_id?: string; sort_order?: number };
    }) => supabase.from('envelopes').update(named(changes)).eq('id', id),
  );

/** Moves the envelope's transactions and money to replacement, if given. */
export const useDeleteEnvelope = () =>
  useChange(({ id, replacement }: { id: string; replacement: string | null }) =>
    supabase.rpc('delete_envelope', { envelope: id, replacement }),
  );

export const useSetEnvelopeOrder = () =>
  useChange(({ ids }: { ids: string[] }) => supabase.rpc('set_envelope_order', { ordered: ids }));

// Envelope groups -----------------------------------------------------------------

export const useCreateGroup = () =>
  useChange((g: { householdId: string; name: string; sortOrder: number }) =>
    supabase.from('envelope_groups').insert({
      household_id: g.householdId,
      name: cleanName(g.name),
      sort_order: g.sortOrder,
    }),
  );

export const useUpdateGroup = () =>
  useChange(({ id, changes }: { id: string; changes: { name?: string; hidden?: boolean } }) =>
    supabase.from('envelope_groups').update(named(changes)).eq('id', id),
  );

/** Only empty groups can be deleted; the database refuses otherwise. */
export const useDeleteGroup = () =>
  useChange(({ id }: { id: string }) => supabase.from('envelope_groups').delete().eq('id', id));

export const useSetGroupOrder = () =>
  useChange(({ ids }: { ids: string[] }) => supabase.rpc('set_envelope_group_order', { ordered: ids }));

// Categories (labels) ---------------------------------------------------------

export const useCreateCategory = () =>
  useChange(
    (c: { householdId: string; name: string; defaultEnvelopeId: string | null; sortOrder: number }) =>
      supabase.from('categories').insert({
        household_id: c.householdId,
        name: cleanName(c.name),
        default_envelope_id: c.defaultEnvelopeId,
        sort_order: c.sortOrder,
      })
      // The new row comes back, so a picker can select it straight away.
      .select('id, name, default_envelope_id, hidden, sort_order')
      .single<Category>(),
  );

export const useUpdateCategory = () =>
  useChange(
    ({
      id,
      changes,
    }: {
      id: string;
      changes: { name?: string; hidden?: boolean; default_envelope_id?: string | null };
    }) => supabase.from('categories').update(named(changes)).eq('id', id),
  );

/** Transactions with it simply lose the label; no money moves. */
export const useDeleteCategory = () =>
  useChange(({ id }: { id: string }) => supabase.from('categories').delete().eq('id', id));

export const useSetCategoryOrder = () =>
  useChange(({ ids }: { ids: string[] }) => supabase.rpc('set_category_order', { ordered: ids }));
