import { useEffect, useState } from 'react';
import { createClient } from '@supabase/supabase-js';

interface StackItem {
  supplement_id: string;
  name: string;
  dose: string;
  link: string | null;
  notes: string | null;
}

/**
 * A simple results page that fetches the most recent supplement stack for the
 * current user based on their email. This page assumes the user's email has
 * been stored in localStorage after authentication or submission. The stack
 * items are displayed with dose, notes, and an optional external link.
 */
export default function Results() {
  const [stack, setStack] = useState<StackItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL as string,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string
    );
    async function fetchStack() {
      setLoading(true);
      // Retrieve the user email from localStorage. In a real application you
      // would get this from the authenticated session.
      const userEmail = window.localStorage.getItem('userEmail') ?? '';
      if (!userEmail) {
        setStack([]);
        setLoading(false);
        return;
      }
      // Select the latest stack and join the related items and supplements.
      const { data: rows, error } = await supabase
        .from('stacks')
        .select(
          'id, created_at, items:stacks_items(supplement_id, dose, note, supplement:supplements(ingredient, dose, link, notes))'
        )
        .eq('user_email', userEmail)
        .order('created_at', { ascending: false })
        .limit(1);
      if (error || !rows || rows.length === 0) {
        console.error(error);
        setStack([]);
      } else {
        const latest = rows[0];
        const items: StackItem[] = latest.items.map((item: any) => ({
          supplement_id: item.supplement_id,
          name: item.supplement.ingredient,
          dose: item.supplement.dose,
          link: item.supplement.link,
          notes: item.supplement.notes ?? item.note ?? null,
        }));
        setStack(items);
      }
      setLoading(false);
    }
    fetchStack();
  }, []);

  if (loading) {
    return <p>Loading your personalized stack…</p>;
  }
  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold mb-4">Your Personalized Supplement Stack</h1>
      {stack.length === 0 ? (
        <p>No recommendations available. Please check back later.</p>
      ) : (
        <ul className="space-y-4">
          {stack.map((item) => (
            <li key={item.supplement_id} className="border rounded p-4">
              <h2 className="text-xl font-semibold">{item.name}</h2>
              <p className="mt-1">Dose: {item.dose}</p>
              {item.notes && (
                <p className="mt-1 text-sm text-gray-600">{item.notes}</p>
              )}
              {item.link && (
                <a
                  className="mt-2 inline-block text-blue-600 underline"
                  href={item.link}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Buy now
                </a>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}