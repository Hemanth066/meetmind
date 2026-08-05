import os
import re
from typing import Optional

try:
    import spacy
except ImportError:
    spacy = None

try:
    import whisper
except ImportError:
    whisper = None

try:
    from openai import OpenAI
except ImportError:
    OpenAI = None


class MeetingAnalyzer:
    def __init__(self):
        self.whisper_model_name = os.getenv("WHISPER_MODEL", "base")
        self.whisper_model = None
        self.nlp = None
        self.openai_client = None

        if spacy:
            try:
                self.nlp = spacy.load("en_core_web_sm")
            except OSError:
                self.nlp = None

        api_key = os.getenv("OPENAI_API_KEY")
        if OpenAI and api_key:
            self.openai_client = OpenAI(api_key=api_key)

    @property
    def whisper_available(self) -> bool:
        return whisper is not None

    @property
    def llm_available(self) -> bool:
        return self.openai_client is not None

    def analyze(
        self,
        meeting_id: str,
        audio_path: Optional[str] = None,
        transcript: str = "",
    ) -> dict:
        if audio_path and os.path.exists(audio_path) and whisper:
            transcript = self._transcribe(audio_path) or transcript

        if not transcript.strip():
            transcript = "No transcript available for this meeting."

        keywords = self._extract_keywords(transcript)
        summary_data = self._summarize(transcript)

        return {
            "meeting_id": meeting_id,
            "transcript": transcript,
            "summary": summary_data.get("summary", ""),
            "key_points": summary_data.get("key_points", []),
            "action_items": summary_data.get("action_items", []),
            "keywords": keywords,
        }

    def _transcribe(self, audio_path: str) -> str:
        if self.whisper_model is None:
            self.whisper_model = whisper.load_model(self.whisper_model_name)
        result = self.whisper_model.transcribe(audio_path)
        return result.get("text", "")

    def _extract_keywords(self, text: str) -> list:
        if not text.strip():
            return []

        if self.nlp:
            doc = self.nlp(text[:100000])
            nouns = [
                chunk.text.lower()
                for chunk in doc.noun_chunks
                if len(chunk.text) > 3
            ]
            seen = set()
            keywords = []
            for n in nouns:
                if n not in seen:
                    seen.add(n)
                    keywords.append(n)
            return keywords[:15]

        words = re.findall(r"\b[a-zA-Z]{5,}\b", text.lower())
        freq = {}
        for w in words:
            freq[w] = freq.get(w, 0) + 1
        return [w for w, _ in sorted(freq.items(), key=lambda x: -x[1])[:15]]

    def _summarize(self, transcript: str) -> dict:
        if self.openai_client:
            return self._llm_summarize(transcript)
        return self._rule_based_summarize(transcript)

    def _llm_summarize(self, transcript: str) -> dict:
        prompt = f"""Analyze this meeting transcript and return:
1. A concise summary (2-3 paragraphs)
2. Key discussion points (bullet list)
3. Action items with assignee if mentioned

Transcript:
{transcript[:12000]}

Respond in this format:
SUMMARY:
...
KEY POINTS:
- point 1
ACTION ITEMS:
- task | assignee | deadline
"""
        try:
            response = self.openai_client.chat.completions.create(
                model=os.getenv("OPENAI_MODEL", "gpt-4o-mini"),
                messages=[{"role": "user", "content": prompt}],
                temperature=0.3,
            )
            content = response.choices[0].message.content or ""
            return self._parse_llm_response(content)
        except Exception:
            return self._rule_based_summarize(transcript)

    def _parse_llm_response(self, content: str) -> dict:
        summary = ""
        key_points = []
        action_items = []

        if "SUMMARY:" in content:
            parts = content.split("KEY POINTS:")
            summary = parts[0].replace("SUMMARY:", "").strip()
            rest = parts[1] if len(parts) > 1 else ""
        else:
            rest = content

        if "ACTION ITEMS:" in rest:
            kp_part, ai_part = rest.split("ACTION ITEMS:", 1)
            key_points = [
                line.lstrip("-• ").strip()
                for line in kp_part.strip().split("\n")
                if line.strip().startswith(("-", "•")) or line.strip()
            ]
            for line in ai_part.strip().split("\n"):
                line = line.lstrip("-• ").strip()
                if not line:
                    continue
                parts = [p.strip() for p in line.split("|")]
                action_items.append(
                    {
                        "task": parts[0],
                        "assignee": parts[1] if len(parts) > 1 else "",
                        "deadline": parts[2] if len(parts) > 2 else "",
                    }
                )
        else:
            key_points = [
                line.lstrip("-• ").strip()
                for line in rest.split("\n")
                if line.strip()
            ][:8]

        return {"summary": summary, "key_points": key_points[:10], "action_items": action_items[:10]}

    def _rule_based_summarize(self, transcript: str) -> dict:
        sentences = re.split(r"(?<=[.!?])\s+", transcript.strip())
        summary = " ".join(sentences[:5]) if sentences else "Meeting transcript processed."
        key_points = sentences[:5] if sentences else []
        action_items = []
        for s in sentences:
            if re.search(r"\b(will|should|need to|action|todo|follow up|assign)\b", s, re.I):
                action_items.append({"task": s.strip(), "assignee": "", "deadline": ""})
        return {
            "summary": summary,
            "key_points": key_points,
            "action_items": action_items[:5],
        }
