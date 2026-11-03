const { z } = require('zod');

const DISCLAIMER = 'These are general fitness and nutrition suggestions, not medical advice. Check with a doctor before starting, especially if you have a health condition, injury or are pregnant. Stop if anything hurts.';

// ---------- output shapes (what the app renders) ----------
const workoutSchema = z.object({
  title: z.string().min(1).max(120),
  summary: z.string().max(500).default(''),
  daysPerWeek: z.number().int().min(1).max(7),
  days: z.array(z.object({
    day: z.string().min(1).max(40),
    focus: z.string().min(1).max(80),
    exercises: z.array(z.object({
      name: z.string().min(1).max(80),
      sets: z.number().int().min(1).max(10),
      reps: z.string().min(1).max(20), // "8-12", "30s", "AMRAP"
      restSec: z.number().int().min(0).max(600).default(60),
      equipment: z.string().max(60).default('Bodyweight'),
      notes: z.string().max(200).default(''),
    })).min(1).max(12),
  })).min(1).max(7),
  notes: z.array(z.string().max(200)).max(8).default([]),
});

const dietSchema = z.object({
  title: z.string().min(1).max(120),
  summary: z.string().max(500).default(''),
  caloriesTarget: z.number().int().min(800).max(6000),
  proteinG: z.number().int().min(10).max(400),
  meals: z.array(z.object({
    name: z.string().min(1).max(60),
    items: z.array(z.string().min(1).max(120)).min(1).max(10),
    calories: z.number().int().min(0).max(2500),
  })).min(1).max(8),
  tips: z.array(z.string().max(200)).max(8).default([]),
});

const SCHEMAS = { workout: workoutSchema, diet: dietSchema };

// ---------- profile → the only facts about the member that are ever used ----------
// Deliberately no name, phone, email or ids: the same object goes to an external model.
const ageFrom = (dob) => {
  if (!dob) return null;
  const years = Math.floor((Date.now() - new Date(dob).getTime()) / (365.25 * 24 * 3600 * 1000));
  return years > 0 && years < 110 ? years : null;
};

const buildProfile = (member, equipmentNames, daysPerWeek) => {
  const latest = [...(member.bodyMetrics || [])].reverse();
  const weightKg = latest.find((m) => m.weightKg)?.weightKg ?? null;
  const heightCm = latest.find((m) => m.heightCm)?.heightCm ?? null;
  return {
    age: ageFrom(member.dob),
    gender: member.gender && member.gender !== 'prefer_not_say' ? member.gender : null,
    weightKg,
    heightCm,
    goal: member.fitnessGoal || 'stay_fit',
    level: member.experienceLevel || 'beginner',
    dietPreference: member.dietPreference || 'veg',
    healthNotes: member.healthNotes || null,
    daysPerWeek,
    equipment: equipmentNames,
  };
};

// ---------- rule-based fallback ----------
const has = (equipment, ...words) => equipment.some((e) => words.some((w) => e.toLowerCase().includes(w)));

const GOAL_REPS = {
  lose_fat: { reps: '12-15', rest: 45 },
  build_muscle: { reps: '8-12', rest: 75 },
  stay_fit: { reps: '10-12', rest: 60 },
  improve_endurance: { reps: '15-20', rest: 40 },
};

const rulesWorkout = (p) => {
  const g = GOAL_REPS[p.goal];
  const sets = p.level === 'beginner' ? 2 : p.level === 'intermediate' ? 3 : 4;
  const machines = has(p.equipment, 'machine', 'press', 'cable', 'leg');
  const dumbbells = has(p.equipment, 'dumbbell', 'barbell', 'weight', 'rack');
  const pick = (machine, free, body) => (machines ? machine : dumbbells ? free : body);
  const ex = (name, equipment, reps = g.reps, n = sets) => ({ name, sets: n, reps, restSec: g.rest, equipment, notes: '' });

  const push = [
    ex(pick('Chest press machine', 'Dumbbell bench press', 'Push-ups'), pick('Machine', 'Dumbbells', 'Bodyweight')),
    ex(pick('Shoulder press machine', 'Dumbbell shoulder press', 'Pike push-ups'), pick('Machine', 'Dumbbells', 'Bodyweight')),
    ex('Triceps dips (bench)', 'Bench / bodyweight'),
    ex('Plank', 'Bodyweight', '30-45s', 3),
  ];
  const pull = [
    ex(pick('Lat pulldown', 'One-arm dumbbell row', 'Superman holds'), pick('Machine', 'Dumbbells', 'Bodyweight')),
    ex(pick('Seated cable row', 'Bent-over dumbbell row', 'Reverse snow angels'), pick('Cable', 'Dumbbells', 'Bodyweight')),
    ex(dumbbells ? 'Dumbbell biceps curl' : 'Towel curls', dumbbells ? 'Dumbbells' : 'Towel'),
    ex('Dead bug', 'Bodyweight', '10 each side', 3),
  ];
  const legs = [
    ex(pick('Leg press', 'Goblet squat', 'Bodyweight squat'), pick('Machine', 'Dumbbell', 'Bodyweight')),
    ex(dumbbells ? 'Romanian deadlift' : 'Glute bridge', dumbbells ? 'Dumbbells' : 'Bodyweight'),
    ex('Walking lunges', 'Bodyweight / dumbbells'),
    ex('Calf raises', 'Bodyweight', '15-20'),
  ];
  const cardio = [
    { ...ex('Brisk walk or light jog', 'Treadmill / outdoors', '20 min', 1), restSec: 0 },
    { ...ex('Cycling or rowing', 'Bike / rower', '10 min', 1), restSec: 0 },
    { ...ex('Mobility stretching', 'Bodyweight', '8 min', 1), restSec: 0 },
  ];

  const templates = {
    1: [['Full body', [push[0], pull[0], legs[0], push[3]]]],
    2: [['Full body A', [push[0], pull[0], legs[0], push[3]]], ['Full body B', [push[1], pull[1], legs[1], pull[3]]]],
    3: [['Full body A', [push[0], pull[0], legs[0], push[3]]], ['Full body B', [push[1], pull[1], legs[1], pull[3]]], ['Cardio & core', cardio]],
    4: [['Push', push], ['Pull', pull], ['Legs', legs], ['Cardio & core', cardio]],
    5: [['Push', push], ['Pull', pull], ['Legs', legs], ['Cardio & core', cardio], ['Full body light', [push[0], pull[0], legs[0], push[3]]]],
  };
  const n = Math.min(Math.max(p.daysPerWeek, 1), 5);
  const days = templates[n].map(([focus, exercises], i) => ({ day: `Day ${i + 1}`, focus, exercises }));

  const notes = [
    'Warm up for 5-8 minutes before every session and stretch afterwards.',
    'Pick a weight where the last 2 reps are hard but your form stays clean.',
    'Rest at least one day between sessions of the same muscle group.',
  ];
  if (p.healthNotes) notes.push('You mentioned a health condition: keep the intensity low, and check with your doctor and a gym trainer before starting.');
  return {
    title: `${n}-day ${p.goal.replace('_', ' ')} plan (${p.level})`,
    summary: 'A simple starter plan built from your goal, level and the equipment at your branch.',
    daysPerWeek: n,
    days,
    notes,
  };
};

const rulesDiet = (p) => {
  // Mifflin-St Jeor; falls back to typical adult values if the profile is incomplete.
  const w = p.weightKg || 70;
  const h = p.heightCm || 168;
  const a = p.age || 28;
  const sex = p.gender === 'female' ? -161 : 5;
  const bmr = 10 * w + 6.25 * h - 5 * a + sex;
  const tdee = bmr * 1.45;
  const target = Math.round({ lose_fat: tdee - 400, build_muscle: tdee + 300, stay_fit: tdee, improve_endurance: tdee + 100 }[p.goal] / 10) * 10;
  const calories = Math.max(1200, target);
  const proteinG = Math.round(w * (p.goal === 'build_muscle' ? 1.8 : p.goal === 'lose_fat' ? 1.6 : 1.3));

  const proteinSource = { veg: 'paneer, curd, dal and sprouts', eggetarian: 'eggs, curd, dal and paneer', non_veg: 'chicken, fish, eggs and dal', vegan: 'tofu, soya chunks, dal and chickpeas' }[p.dietPreference];
  const split = [['Breakfast', 0.25], ['Mid-morning snack', 0.1], ['Lunch', 0.3], ['Evening snack', 0.1], ['Dinner', 0.25]];
  const items = {
    Breakfast: ['Oats or vegetable poha / upma', { vegan: 'Soy milk or a banana', veg: 'Milk or curd', eggetarian: 'Milk, curd or an egg', non_veg: 'Milk, curd or an egg' }[p.dietPreference], 'A fruit'],
    'Mid-morning snack': ['A fruit or a handful of nuts'],
    Lunch: ['2 rotis or 1 cup rice', `1 bowl of ${proteinSource}`, 'Vegetable sabzi', 'Salad'],
    'Evening snack': ['Sprouts, roasted chana or a protein-rich snack', (p.dietPreference === 'vegan' ? 'Green tea' : 'Green tea or buttermilk')],
    Dinner: ['1-2 rotis or a small bowl of rice', `A portion of ${proteinSource}`, 'Vegetables or soup'],
  };
  const tips = [
    'Drink 2.5-3 litres of water a day.',
    'Keep fried food and sugary drinks to once or twice a week.',
    `Aim for roughly ${proteinG} g of protein a day, spread across meals.`,
    'Quantities are a guide: adjust portions to how you feel and how your weight is trending over 2-3 weeks.',
  ];
  if (p.healthNotes) tips.push('You mentioned a health condition: please have a doctor or dietitian review this before following it.');
  return {
    title: `${p.dietPreference.replace('_', '-')} meal plan, about ${calories} kcal`,
    summary: 'A simple Indian-style meal plan matched to your goal and food preference.',
    caloriesTarget: calories,
    proteinG,
    meals: split.map(([name, share]) => ({ name, items: items[name], calories: Math.round((calories * share) / 10) * 10 })),
    tips,
  };
};

const rules = (type, profile) => (type === 'workout' ? rulesWorkout(profile) : rulesDiet(profile));

// ---------- AI ----------
const SYSTEM = `You are a careful gym coach and nutritionist writing a plan for a gym member.
Reply with ONE JSON object and nothing else (no markdown fences, no commentary).
Rules:
- Be conservative and safe. If healthNotes is present, keep intensity/diet gentle and tell the member to check with a doctor.
- Only use equipment listed in "equipment"; if the list is empty or lacks something, prefer bodyweight alternatives.
- For diets, use common Indian foods and respect dietPreference strictly (veg = no eggs/meat/fish; vegan = no animal products).
- Never give medical advice, diagnose anything, or recommend supplements or drugs.
- Keep every string short; the member reads it on a phone.`;

const SHAPES = {
  workout: '{"title":string,"summary":string,"daysPerWeek":int,"days":[{"day":"Day 1","focus":string,"exercises":[{"name":string,"sets":int,"reps":string,"restSec":int,"equipment":string,"notes":string}]}],"notes":[string]}',
  diet: '{"title":string,"summary":string,"caloriesTarget":int,"proteinG":int,"meals":[{"name":string,"items":[string],"calories":int}],"tips":[string]}',
};

const extractJson = (text) => {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end <= start) throw new Error('no JSON in model reply');
  return JSON.parse(text.slice(start, end + 1));
};

const aiPlan = async (type, profile) => {
  const Anthropic = require('@anthropic-ai/sdk');
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, timeout: 60000, maxRetries: 1 });
  const msg = await client.messages.create({
    model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-5-5',
    max_tokens: 4000,
    system: SYSTEM,
    messages: [{
      role: 'user',
      content: `Write a ${type} plan as JSON matching this shape:\n${SHAPES[type]}\n\nMember profile:\n${JSON.stringify(profile)}`,
    }],
  });
  const text = msg.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
  return SCHEMAS[type].parse(extractJson(text));
};

// Returns { source, content }. `allowAi` is the tenant's features:aiPlans flag. Any AI
// failure (no key, network, bad JSON, schema mismatch) degrades to the rule-based plan —
// the member always gets something rather than an error screen.
const generatePlan = async ({ type, profile, allowAi }) => {
  if (allowAi && process.env.ANTHROPIC_API_KEY) {
    try {
      return { source: 'ai', content: { ...(await aiPlan(type, profile)), disclaimer: DISCLAIMER } };
    } catch (err) {
      if (process.env.NODE_ENV !== 'test') console.error('AI plan failed, using rules:', err.message);
    }
  }
  return { source: 'rules', content: { ...SCHEMAS[type].parse(rules(type, profile)), disclaimer: DISCLAIMER } };
};

module.exports = { generatePlan, buildProfile, rules, SCHEMAS, DISCLAIMER, ageFrom };
