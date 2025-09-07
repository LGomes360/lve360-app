import type { NextApiRequest, NextApiResponse } from 'next';
import { generateStack } from '@/lib/generateStack';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const submissionId = (req.query.id as string) || ''; // expects /api/test-stack?id=xxxx
  const goals = req.query.goals ? (Array.isArray(req.query.goals) ? req.query.goals : [req.query.goals]) : [];
  try {
    const stack = await generateStack({
      id: submissionId,
      goals: goals.length ? goals : ['Weight Loss', 'Longevity'],
      // add other fields as needed for your generateStack signature
    });
    res.status(200).json(stack);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
}
