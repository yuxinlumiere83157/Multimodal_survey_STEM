const STRESS_QUESTION_IDS = new Set(['1', '2', '3', '4', '5', '6']);

function extractNumericResponse(answer) {
  if (answer == null) return null;
  const match = String(answer).match(/\d+(?:\.\d+)?/);
  return match ? Number.parseFloat(match[0]) : null;
}

function average(values) {
  return values.length > 0 ? Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 100) / 100 : 0;
}

function questionLookupFromPayload(questions) {
  return Object.fromEntries(
    questions
      .filter((question) => question && question.id != null)
      .map((question) => [String(question.id), question])
  );
}

export function scoreStudyAnswers(answers, questions) {
  const rawAnswers = Object.fromEntries(
    Object.entries(answers).filter(([questionId]) => questionId !== 'sessionId')
  );
  const lookup = questionLookupFromPayload(questions);
  const scoredAnswers = {};
  const stressScores = [];
  const susContributions = [];
  const trustPrivacyScores = [];
  const reflectionAnswers = {};

  Object.entries(rawAnswers).forEach(([questionId, answer]) => {
    const question = lookup[questionId];
    if (!question || answer == null) return;

    if (question.type === 'text' || question.construct === 'reflection') {
      reflectionAnswers[questionId] = {
        question: question.question || '',
        answer: String(answer),
      };
      return;
    }

    const numeric = extractNumericResponse(answer);
    if (numeric == null) return;

    let score = null;
    if (question.construct === 'stress') {
      score = question.reverse ? 4 - numeric : numeric;
      stressScores.push(score);
    } else if (question.construct === 'sus') {
      score = question.reverse ? 5 - numeric : numeric - 1;
      susContributions.push(score);
    } else if (question.construct === 'trust_privacy') {
      score = question.reverse ? 6 - numeric : numeric;
      trustPrivacyScores.push(score);
    }

    scoredAnswers[questionId] = {
      question: question.question || '',
      category: question.category || '',
      construct: question.construct,
      reverse: Boolean(question.reverse),
      rawAnswer: answer,
      numeric,
      score: score == null ? null : Math.round(score * 100) / 100,
    };
  });

  return {
    rawAnswers,
    scoredAnswers,
    summaryScores: {
      stressAverage_0_to_4: average(stressScores),
      susScore_0_to_100: susContributions.length > 0 ? Math.round(sum(susContributions) * 2.5 * 100) / 100 : 0,
      trustPrivacyAverage_1_to_5: average(trustPrivacyScores),
    },
    reflectionAnswers,
  };
}

function sum(values) {
  return values.reduce((total, value) => total + value, 0);
}

export function analyzeStudyResults({ answers, questions, emotionSession = {} }) {
  const scored = scoreStudyAnswers(answers, questions);
  const stressAverage = scored.summaryScores.stressAverage_0_to_4;
  const stressLevel = stressAverage >= 3 ? 'High stress' : stressAverage >= 2 ? 'Moderate stress' : 'Low stress';
  const lookup = questionLookupFromPayload(questions);
  const stressQuestionIds = Object.entries(lookup)
    .filter(([questionId, question]) => question.construct === 'stress' && STRESS_QUESTION_IDS.has(questionId))
    .map(([questionId]) => questionId)
    .sort((a, b) => Number(a) - Number(b));

  const allEmotions = [];
  const validFiles = [];
  const missingFiles = [];

  (stressQuestionIds.length > 0 ? stressQuestionIds : [...STRESS_QUESTION_IDS]).forEach((questionId) => {
    const emotionInfo = emotionSession[questionId];
    const timeline = emotionInfo?.emotionTimeline || [];

    if (timeline.length === 0) {
      missingFiles.push(`question_${questionId}_emotions.json`);
      return;
    }

    validFiles.push(`question_${questionId}_emotions.json`);
    timeline.forEach((item) => {
      if (item?.emotion) allEmotions.push(item.emotion);
    });
  });

  const emotionCounts = {};
  allEmotions.forEach((emotion) => {
    emotionCounts[emotion] = (emotionCounts[emotion] || 0) + 1;
  });

  const totalSamples = allEmotions.length;
  const emotionPercentages = Object.fromEntries(
    Object.entries(emotionCounts).map(([emotion, count]) => [
      emotion,
      totalSamples > 0 ? Math.round((count / totalSamples) * 10000) / 100 : 0,
    ])
  );

  const positivePct = roundPercent(['Happiness', 'Surprise'], emotionPercentages);
  const neutralPct = roundPercent(['Neutral'], emotionPercentages);
  const negativePct = roundPercent(['Sadness', 'Fear', 'Disgust', 'Anger'], emotionPercentages);

  let facialPattern = 'Unavailable';
  let discrepancyDetected = false;
  let comparisonNote = 'Facial data unavailable or insufficient.';

  if (totalSamples > 0) {
    if (negativePct >= neutralPct && negativePct >= positivePct) {
      facialPattern = 'Mostly negative facial-emotion signals';
    } else if (positivePct >= neutralPct && positivePct >= negativePct) {
      facialPattern = 'Mostly positive facial-emotion signals';
    } else {
      facialPattern = 'Mostly neutral facial expressions';
    }

    if (stressLevel === 'High stress' && neutralPct >= 50) {
      discrepancyDetected = true;
      comparisonNote = 'High self-reported stress was paired with mostly neutral facial expressions.';
    } else if (stressLevel === 'Low stress' && negativePct >= 25) {
      discrepancyDetected = true;
      comparisonNote = 'Low self-reported stress was paired with noticeable negative facial-emotion signals.';
    } else {
      comparisonNote = 'No strong discrepancy detected at session level.';
    }
  }

  return {
    success: true,
    selfReport: {
      instrument: 'Momentary stress items',
      stressAverage_0_to_4: stressAverage,
      stressLevel,
      stressQuestionIds,
    },
    facialEmotion: {
      facialPattern,
      emotionCounts,
      emotionPercentages,
      emotionBreakdown: {
        positive: positivePct,
        neutral: neutralPct,
        negative: negativePct,
      },
      totalSamples,
      validStressQuestionFiles: validFiles,
      missingStressQuestionFiles: missingFiles,
    },
    comparison: {
      discrepancyDetected,
      note: comparisonNote,
    },
    localOnly: true,
  };
}

function roundPercent(emotions, emotionPercentages) {
  return Math.round(sum(emotions.map((emotion) => emotionPercentages[emotion] || 0)) * 100) / 100;
}
