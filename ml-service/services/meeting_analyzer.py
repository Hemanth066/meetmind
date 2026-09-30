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

        stopwords = {
            "meeting", "title", "duration", "total", "participants", "participant",
            "spoken", "dialogue", "transcript", "session", "notes", "recorded",
            "during", "about", "there", "their", "where", "which", "would", "could",
            "should", "hello", "system", "please", "thanks", "thank"
        }

        if self.nlp:
            doc = self.nlp(text[:100000])
            nouns = [
                chunk.text.lower().strip()
                for chunk in doc.noun_chunks
                if len(chunk.text) > 3 and chunk.text.lower().strip() not in stopwords
            ]
            seen = set()
            keywords = []
            for n in nouns:
                if n not in seen and not any(w in stopwords for w in n.split()):
                    seen.add(n)
                    keywords.append(n)
            if keywords:
                return keywords[:12]

        clean_text = re.sub(r"\[.*?\]:", "", text)
        words = re.findall(r"\b[a-zA-Z]{4,}\b", clean_text.lower())
        freq = {}
        for w in words:
            if w not in stopwords:
                freq[w] = freq.get(w, 0) + 1
        sorted_words = [w for w, _ in sorted(freq.items(), key=lambda x: -x[1])]
        return sorted_words[:12]

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
        lines = [line.strip() for line in transcript.split("\n") if line.strip()]
        clean_sentences = []

        for line in lines:
            if line.startswith(("Meeting Title:", "Duration:", "Total Participants:", "---")):
                continue
            # Strip prefix like [Speaker Name]: or [Chat - User]:
            cleaned = re.sub(r"^\[.*?\]:\s*", "", line).strip()
            if cleaned and len(cleaned) > 2 and not cleaned.startswith("No spoken dialogue"):
                clean_sentences.append(cleaned)

        if clean_sentences:
            summary = "Key discussion points from this session: " + " ".join(clean_sentences[:4])
            key_points = clean_sentences[:6]
        else:
            summary = "Meeting completed with participants. No extended speech or chat transcript was recorded."
            key_points = ["Meeting commenced and concluded successfully.", "Participant audio and video channels were active."]

        action_items = []
        for s in clean_sentences:
            if re.search(r"\b(will|should|need to|action|todo|follow up|assign|must|going to)\b", s, re.I):
                action_items.append({"task": s, "assignee": "", "deadline": ""})

        if not action_items and clean_sentences:
            action_items.append({"task": f"Review meeting notes regarding: {clean_sentences[0]}", "assignee": "", "deadline": ""})

        return {
            "summary": summary,
            "key_points": key_points[:10],
            "action_items": action_items[:5],
        }
