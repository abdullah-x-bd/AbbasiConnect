import { createWorker } from "tesseract.js";

const rejectPatterns = [
  /government/i,
  /india/i,
  /aadhaar|aadhar/i,
  /unique identification/i,
  /male|female|transgender/i,
  /dob|date of birth|year of birth|yob/i,
  /address/i,
  /www\.|uidai/i,
];

function looksLikeName(line: string) {
  const cleaned = line.replace(/[^A-Za-z .'-]/g, " ").replace(/\s+/g, " ").trim();
  const words = cleaned.split(" ").filter(Boolean);
  return cleaned.length >= 3 && cleaned.length <= 80 && words.length >= 2 && words.length <= 6 && !rejectPatterns.some((pattern) => pattern.test(cleaned));
}

function titleCase(value: string) {
  return value.toLowerCase().replace(/\b[a-z]/g, (letter) => letter.toUpperCase());
}

export function extractLikelyName(ocrText: string) {
  const lines = ocrText
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean);

  const dobIndex = lines.findIndex((line) => /\b(DOB|Date of Birth|Year of Birth|YOB)\b/i.test(line));
  if (dobIndex > 0) {
    for (let i = dobIndex - 1; i >= Math.max(0, dobIndex - 4); i -= 1) {
      if (looksLikeName(lines[i])) return titleCase(lines[i].replace(/[^A-Za-z .'-]/g, " ").replace(/\s+/g, " ").trim());
    }
  }

  for (const line of lines) {
    if (looksLikeName(line)) return titleCase(line.replace(/[^A-Za-z .'-]/g, " ").replace(/\s+/g, " ").trim());
  }

  return "";
}

export async function scanAadhaarImage(imageDataUrl: string) {
  const worker = await createWorker("eng");
  try {
    const result = await worker.recognize(imageDataUrl);
    const text = result.data.text ?? "";
    return {
      text,
      displayName: extractLikelyName(text),
      confidence: result.data.confidence ?? null,
    };
  } finally {
    await worker.terminate();
  }
}
