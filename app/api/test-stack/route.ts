import { NextRequest } from 'next/server';
import { generateStack } from '@/lib/generateStack';

// /app/api/test-stack/route.ts
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);

  // Parse query params
  const id = searchParams.get('id') || '';
  const goals = searchParams.getAll('goals').length
    ? searchParams.getAll('goals')
    : ['Weight Loss', 'Longevity'];

  try {
    const stack = await generateStack({
      id,
      goals,
      // Add other fields if needed for generateStack signature
    });
    return new Response(JSON.stringify(stack), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: String(err) }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
