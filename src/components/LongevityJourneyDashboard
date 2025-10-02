"use client";

import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { Textarea } from "@/components/ui/textarea";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ReferenceLine,
} from "recharts";
import { ArrowUp, ArrowDown } from "lucide-react";

// Mock monthly goal-based data (replace with /api/logs later if you want real charting)
const progressData = [
  { date: "Week 1", weight: 265, sleep: 2.5, energy: 4 },
  { date: "Week 2", weight: 264, sleep: 3, energy: 5 },
  { date: "Week 3", weight: 263.5, sleep: 3.5, energy: 6 },
  { date: "Week 4", weight: 263, sleep: 4, energy: 6 },
];

const startWeight = 280;

export default function LongevityJourneyDashboard() {
  // State for goals
  const [targetWeight, setTargetWeight] = useState(250);
  const [targetSleep, setTargetSleep] = useState(4.5);
  const [targetEnergy, setTargetEnergy] = useState(8);

  // State for daily log
  const [logWeight, setLogWeight] = useState("");
  const [logSleep, setLogSleep] = useState(3);
  const [logEnergy, setLogEnergy] = useState(5);
  const [logNotes, setLogNotes] = useState("");

  // State for AI Insights
  const [aiSummary, setAiSummary] = useState("No insights yet — save a log to generate one.");

  // Weekly challenge progress
  const [progress, setProgress] = useState(0);
  const daysComplete = progress / 20;

  // Load goals from API
  useEffect(() => {
    (async () => {
      const res = await fetch("/api/goals");
      if (!res.ok) return;
      const g = await res.json();
      if (!g) return;
      if (g.target_weight != null) setTargetWeight(Number(g.target_weight));
      if (g.target_sleep != null) setTargetSleep(Number(g.target_sleep));
      if (g.target_energy != null) setTargetEnergy(Number(g.target_energy));
    })();
  }, []);

  // Save goals to API whenever changed
  const updateGoal = async (field: string, value: number) => {
    if (field === "weight") setTargetWeight(value);
    if (field === "sleep") setTargetSleep(value);
    if (field === "energy") setTargetEnergy(value);

    await fetch("/api/goals", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        target_weight: field === "weight" ? value : targetWeight,
        target_sleep: field === "sleep" ? value : targetSleep,
        target_energy: field === "energy" ? value : targetEnergy,
      }),
    });
  };

  // Handle save log + AI insights
  const handleSaveLog = async () => {
    const body = {
      weight: logWeight ? Number(logWeight) : null,
      sleep: logSleep,
      energy: logEnergy,
      notes: logNotes,
    };

    // Save log
    await fetch("/api/logs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    // Call AI insights
    const ai = await fetch("/api/ai-insights", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).then((r) => r.json());

    if (ai?.summary) setAiSummary(ai.summary);
  };

  // Progress metrics
  const currentWeight = progressData[progressData.length - 1].weight;
  const weightLoss = startWeight - currentWeight;
  const weightGoalProgress = (
    (weightLoss / (startWeight - targetWeight)) *
    100
  ).toFixed(0);

  const currentSleep = progressData[progressData.length - 1].sleep;
  const sleepGoalProgress = ((currentSleep / targetSleep) * 100).toFixed(0);

  const currentEnergy = progressData[progressData.length - 1].energy;
  const energyGoalProgress = ((currentEnergy / targetEnergy) * 100).toFixed(0);

  return (
    <div className="p-6 grid gap-6 bg-gray-50 min-h-screen">
      {/* Header */}
      <div className="text-center">
        <h1 className="text-2xl font-bold text-purple-700">
          Your Longevity Journey
        </h1>
        <p className="text-gray-600">
          Daily insights and evolving plans powered by LVE360
        </p>
      </div>

      {/* Goals Overview */}
      <Card className="shadow-lg rounded-2xl bg-gradient-to-r from-purple-50 to-yellow-50">
        <CardContent className="p-6 space-y-6">
          <div className="grid grid-cols-3 gap-4 text-center">
            {/* Weight */}
            <div>
              <h3 className="text-sm font-semibold text-purple-600">
                Weight Goal
              </h3>
              <p className="flex items-center justify-center text-xl font-bold text-purple-700">
                {currentWeight} lbs{" "}
                <ArrowDown className="w-4 h-4 text-red-500 ml-1" />
              </p>
              <p className="text-xs text-purple-500">
                Goal: {targetWeight} lbs ({weightGoalProgress}% to goal)
              </p>
              <Input
                type="number"
                value={targetWeight}
                onChange={(e) =>
                  updateGoal("weight", Number(e.target.value))
                }
                className="mt-2 text-center border-purple-300 focus:ring-purple-400"
              />
            </div>

            {/* Sleep */}
            <div>
              <h3 className="text-sm font-semibold text-purple-600">
                Sleep Goal
              </h3>
              <p className="flex items-center justify-center text-xl font-bold text-purple-700">
                {currentSleep} / 5{" "}
                <ArrowUp className="w-4 h-4 text-yellow-500 ml-1" />
              </p>
              <p className="text-xs text-purple-500">
                Goal: {targetSleep} stars ({sleepGoalProgress}% to goal)
              </p>
              <Input
                type="number"
                step="0.1"
                value={targetSleep}
                onChange={(e) =>
                  updateGoal("sleep", Number(e.target.value))
                }
                className="mt-2 text-center border-purple-300 focus:ring-purple-400"
              />
            </div>

            {/* Energy */}
            <div>
              <h3 className="text-sm font-semibold text-purple-600">
                Energy Goal
              </h3>
              <p className="flex items-center justify-center text-xl font-bold text-yellow-600">
                {currentEnergy} / 10{" "}
                <ArrowUp className="w-4 h-4 text-yellow-500 ml-1" />
              </p>
              <p className="text-xs text-purple-500">
                Goal: {targetEnergy} ({energyGoalProgress}% to goal)
              </p>
              <Input
                type="number"
                value={targetEnergy}
                onChange={(e) =>
                  updateGoal("energy", Number(e.target.value))
                }
                className="mt-2 text-center border-yellow-300 focus:ring-yellow-400"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Weekly Challenge */}
      <Card className="shadow-lg rounded-2xl bg-gradient-to-r from-yellow-100 to-purple-100">
        <CardContent className="p-4 space-y-4">
          <h2 className="text-lg font-semibold text-purple-700 mb-2">
            This Week’s Challenge
          </h2>
          <p className="text-gray-700">
            Lights down + screens off 60 minutes before bed for 5 nights.
          </p>
          <div className="w-full bg-purple-200 rounded-full h-4">
            <div
              className="bg-yellow-400 h-4 rounded-full transition-all duration-300"
              style={{ width: `${progress}%` }}
            ></div>
          </div>
          <p className="text-sm text-purple-600 text-center">
            {daysComplete} of 5 days complete
          </p>
          <Button
            onClick={() =>
              setProgress((prev) => (prev < 100 ? prev + 20 : 100))
            }
            className="bg-purple-600 hover:bg-purple-700 w-full text-white"
          >
            Mark Today Complete
          </Button>
        </CardContent>
      </Card>

      {/* Daily Log */}
      <Card className="shadow-lg rounded-2xl bg-gradient-to-r from-purple-50 to-yellow-50">
        <CardContent className="p-4 space-y-4">
          <h2 className="text-lg font-semibold text-purple-700 mb-2">
            Tell Me About Your Day
          </h2>
          <div>
            <label className="text-sm text-purple-600">Weight (lbs)</label>
            <Input
              type="number"
              value={logWeight}
              onChange={(e) => setLogWeight(e.target.value)}
              placeholder="Enter today’s weight"
              className="mt-2 border-purple-300 focus:ring-purple-400"
            />
          </div>
          <div>
            <label className="text-sm text-purple-600">Energy (1–10)</label>
            <Slider
              value={[logEnergy]}
              onValueChange={(val) => setLogEnergy(val[0])}
              max={10}
              step={1}
              className="mt-2"
            />
          </div>
          <div>
            <label className="text-sm text-purple-600">Sleep (1–5 stars)</label>
            <Slider
              value={[logSleep]}
              onValueChange={(val) => setLogSleep(val[0])}
              max={5}
              step={1}
              className="mt-2"
            />
          </div>
          <div>
            <label className="text-sm text-purple-600">How did you feel?</label>
            <Textarea
              value={logNotes}
              onChange={(e) => setLogNotes(e.target.value)}
              placeholder="Tell us how your day felt (energy, mood, focus)."
              className="border-purple-300 focus:ring-purple-400"
            />
          </div>
          <Button
            onClick={handleSaveLog}
            className="w-full bg-yellow-400 hover:bg-yellow-500 text-purple-900 font-semibold"
          >
            Save Log
          </Button>
        </CardContent>
      </Card>

      {/* AI Insights */}
      <Card className="shadow-lg rounded-2xl bg-gradient-to-r from-purple-100 to-yellow-100">
        <CardContent className="p-4">
          <h2 className="text-lg font-semibold text-purple-700 mb-2">
            AI Insights
          </h2>
          <p className="text-gray-700">{aiSummary}</p>
        </CardContent>
      </Card>
    </div>
  );
}
