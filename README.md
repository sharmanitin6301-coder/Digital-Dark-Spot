# Digital Dark Spot

> **AI-Assisted Information Gap Detection Platform.**

Digital Dark Spot cross-examines multiple sources on a research topic, illuminates blind spots, flags contradictory claims, highlights potentially outdated statements, and verifies every cited piece of evidence verbatim—presented in an editorial washi-paper dossier with an immersive 3D workshop experience.

---

## Table of Contents

- [Problem Statement](#problem-statement)
- [Solution Overview](#solution-overview)
- [Key Features](#key-features)
- [How It Works](#how-it-works)
- [Technology Stack](#technology-stack)
- [Architecture & Project Structure](#architecture--project-structure)
- [Prerequisites](#prerequisites)
- [Local Installation](#local-installation)
- [Environment Configuration](#environment-configuration)
- [Running the Project](#running-the-project)
- [API Documentation](#api-documentation)
- [Offline Sample Demo](#offline-sample-demo)
- [Security & Known Limitations](#security--known-limitations)
- [Future Scope](#future-scope)

---

## Problem Statement

When researching critical decisions—financial guidelines, scholarship requirements, healthcare advisories, or legal terms—information is rarely centralized in a single comprehensive document. Instead, it is fragmented across institutional websites, outdated press releases, third-party summaries, and policy circulars.

Readers typically face three compounding challenges:
1. **Hidden Information Gaps:** Vital prerequisites, exclusions, or deadlines are omitted from secondary summaries without indication.
2. **Unreconciled Contradictions:** Two legitimate sources cite conflicting criteria (e.g., varying income thresholds or GPA baselines) with no clarification.
3. **Hallucinated or Distorted Citations:** Generative AI summaries frequently invent citations, merge disparate claims, or reference details that do not exist in the source material.

---

## Solution Overview

**Digital Dark Spot** transforms source comparison from subjective skimming into a structured, audit-grade verification process:

- Users provide a targeted research question alongside **2 to 5 sources** (via live URLs or pasted text).
- The platform extracts clean, sanitized article content while protecting against SSRF and oversized inputs.
- Google Gemini evaluates the corpus using strict negative-constraint grounding rules, returning a structured analysis schema.
- A deterministic server-side **evidence verifier** checks every cited quote verbatim against the original text.
- Findings are rendered in an editorial washi-paper dossier featuring interactive evidence drawers, confidence indicators, and a prioritized **Verify Next** action checklist.

---

## Key Features

- **Multi-Source Information Extraction:** Ingests 2 to 5 web URLs or pasted text documents simultaneously. Sanitizes HTML, strips navigation, scripts, and boilerplate, and normalizes timestamps.
- **Gemini-Powered Structured Analysis:** Generates structured intelligence using `@google/genai` SDK with strict JSON schema constraints.
- **Potential Information Gap Detection:** Surfaces critical missing topics, unaddressed edge cases, and omitted conditions across sources.
- **Contradiction Identification:** Directly contrasts conflicting statements side-by-side, citing exact claims and quotes from each respective source.
- **Outdated Information Signals:** Identifies chronological discrepancies, superseded policies, and stale publication dates.
- **Verbatim Evidence Verification:** Server-side regex boundary scanner inspects all cited quotes ($\le 25$ words) against source texts, flagging unverified or modified claims.
- **Verify Next Checklist:** Interactive action plan recommending specific primary authorities to contact, with real-time completion tracking, markdown copy, and `.txt` export.
- **Offline Sample Demo:** Fully self-contained, precomputed scholarship demo dataset allowing instant evaluation without API keys or network latency.
- **Immersive Animated Interface:** Features a 3D workshop scene built with Three.js/WebGL, scroll-linked camera transitions across eight chapters, ember shaders, and an editorial washi-paper sheet reveal.

---

## How It Works

```
┌─────────────────────────┐
│   User Research Query   │
│   + 2–5 Sources (URL/Txt│
└────────────┬────────────┘
             │
             ▼
┌─────────────────────────┐
│   Source Extraction     │
│  - SSRF IP validation   │
│  - HTML boilerplate strip
│  - Text capped <= 12k   │
└────────────┬────────────┘
             │
             ▼
┌─────────────────────────┐
│ Google Gemini Analysis  │
│  - gemini-3.8-flash     │
│  - Strict JSON Schema   │
│  - Fallback to 3.6-flash│
└────────────┬────────────┘
             │
             ▼
┌─────────────────────────┐
│  Evidence Verification  │
│  - Word-boundary scan   │
│  - Verbatim match check │
│  - Verified stats audit │
└────────────┬────────────┘
             │
             ▼
┌─────────────────────────┐
│   Results Dossier UI    │
│  - Washi paper reveal   │
│  - Evidence drawer      │
│  - Interactive checklist│
└─────────────────────────┘
```

1. **Question & Source Ingestion:** The user enters a research question and submits 2 to 5 sources (URLs or pasted documents).
2. **Server-Side Ingestion & SSRF Guard:** URLs are validated via DNS resolution to reject private, loopback, and metadata addresses. Clean article text is extracted and bounded to $\le 12,000$ characters.
3. **Structured Analytical Synthesis:** The backend prompts Google Gemini with grounded negative constraints. The model outputs structured findings (summary points, gaps, conflicts, outdated signals, and checklist items).
4. **Deterministic Evidence Audit:** The server evaluates every cited evidence quote against the source text to verify verbatim fidelity.
5. **Dossier & Interactive Review:** The client displays the verified dossier with transparent model labeling, evidence drawers for source context, and an actionable checklist.

---

## Technology Stack

- **Backend Runtime:** Node.js (CommonJS, `engines: { "node": ">=20.0.0" }`)
- **Web Framework:** Express 5.x
- **AI Integration:** Google Gemini API via official `@google/genai` (v2.32.0)
  - *Primary Model:* `gemini-3.8-flash`
  - *Fallback Model:* `gemini-3.6-flash`
- **Content Parsing & Security:** `cheerio` (HTML text extraction), `ipaddr.js` (CIDR/SSRF validation)
- **Frontend Layer:** Vanilla JavaScript (ES6+), Semantic HTML5, CSS3 Custom Properties
- **3D Graphics & Visuals:** Three.js (r169), WebGL, Web Worker, custom GLSL fragment shaders (ember, tear, smoke effects)
- **Configuration:** `dotenv`

---

## Architecture & Project Structure

```
digital-dark-spot/
├── controllers/
│   ├── analysisController.js     # Orchestrates Gemini analysis and evidence verification
│   └── sourceController.js       # Coordinates SSRF-validated web page extraction
├── middleware/
│   ├── validateAnalysis.js       # Validates question length and usable source counts
│   └── validateSources.js        # Validates source counts, URL syntaxes, and protocols
├── public/
│   ├── app.js                    # Client application, state machine, and UI controller
│   ├── index.html                # 3D WebGL workshop, chapter layout, and washi dossier
│   ├── sample-data.js            # Self-contained offline scholarship sample dataset
│   └── landing-pages/
│       └── kibori-assets/        # Visual artwork and iconography
├── routes/
│   ├── analysisRoutes.js         # POST /api/analyze route definition
│   └── sourceRoutes.js           # POST /api/fetch-sources route definition
├── services/
│   ├── contentExtractor.js       # Cheerio HTML parsing and length bounding (<= 12,000 chars)
│   ├── evidenceVerifier.js       # Deterministic word-boundary verbatim quote matcher
│   ├── fetchService.js           # Safe HTTP client enforcing timeouts and redirect SSRF checks
│   ├── geminiService.js          # Gemini SDK client, controlled backoff, and transparent fallback
│   └── urlValidator.js           # DNS lookup and IP blacklist (blocks loopback, RFC 1918, metadata)
├── .env.example                  # Template environment variables file (placeholders only)
├── .gitignore                    # Excludes .env, node_modules/, and system artifacts
├── package.json                  # Project manifest, dependencies, and scripts
└── server.js                     # Express application entry point and static file server
```

---

## Prerequisites

- **Node.js:** Version `20.0.0` or higher (`node -v`)
- **npm:** Version `9.0.0` or higher (`npm -v`)
- **Google Gemini API Key:** Required for live analysis requests. Obtainable at [Google AI Studio](https://aistudio.google.com/). *(Not required for running the offline Sample Demo).*

---

## Local Installation

1. **Clone the repository:**
   ```bash
   git clone https://github.com/<your-username>/digital-dark-spot.git
   cd digital-dark-spot
   ```

2. **Install project dependencies:**
   ```bash
   npm install
   ```

---

## Environment Configuration

Create a local `.env` file in the root directory by copying the provided template:

```bash
cp .env.example .env
```

Open `.env` and configure your API key:

```ini
# Google Gemini API Key from Google AI Studio
GEMINI_API_KEY=your_actual_gemini_api_key_here

# Optional Configurations
PORT=3000
GEMINI_MODEL=gemini-3.8-flash
```

> [!CAUTION]
> Never commit your `.env` file or expose your actual `GEMINI_API_KEY` in source control. The `.gitignore` file is pre-configured to exclude `.env`.

---

## Running the Project

### Development Mode (with automatic file watching):
```bash
npm run dev
```

### Production Mode:
```bash
npm start
```

Once started, open your browser and navigate to:
```
http://localhost:3000
```

---

## API Documentation

### 1. Health Check
Returns the service health status.

- **Endpoint:** `GET /api/health`
- **Response (200 OK):**
  ```json
  {
    "status": "ok",
    "project": "Digital Dark Spot"
  }
  ```

---

### 2. Fetch Sources
Extracts and sanitizes text from a list of external URLs.

- **Endpoint:** `POST /api/fetch-sources`
- **Headers:** `Content-Type: application/json`
- **Request Body:**
  ```json
  {
    "sources": [
      { "id": "S1", "url": "https://example.com/advisory-guidelines" },
      { "id": "S2", "url": "https://example.com/policy-update" }
    ]
  }
  ```
- **Response (200 OK):**
  ```json
  {
    "success": true,
    "sources": [
      {
        "id": "S1",
        "url": "https://example.com/advisory-guidelines",
        "title": "Advisory Guidelines 2026",
        "text": "Extracted and sanitized text content...",
        "detectedDate": "2026-03-15",
        "fetchStatus": "success",
        "error": null
      }
    ]
  }
  ```

---

### 3. Analyze Sources
Cross-examines provided sources against the research question, detects information gaps, and validates evidence quotes verbatim.

- **Endpoint:** `POST /api/analyze`
- **Headers:** `Content-Type: application/json`
- **Request Body:**
  ```json
  {
    "question": "What are the eligibility criteria and income cutoffs?",
    "sources": [
      {
        "id": "S1",
        "url": "https://example.com/guidelines",
        "title": "Official Guidelines",
        "text": "Applicants must maintain a 3.0 GPA. Income cutoff is $40,000.",
        "detectedDate": "2026-01-10",
        "fetchStatus": "success"
      },
      {
        "id": "S2",
        "url": "Pasted: Advisory Memo",
        "title": "Advisory Memo",
        "text": "Priority review is given to applicants with income under $50,000.",
        "detectedDate": null,
        "fetchStatus": "success"
      }
    ]
  }
  ```
- **Response (200 OK):**
  ```json
  {
    "success": true,
    "question": "What are the eligibility criteria and income cutoffs?",
    "model": "gemini-3.8-flash",
    "model_used": "gemini-3.8-flash",
    "is_fallback": false,
    "summary": [
      {
        "point": "Applicants must maintain a 3.0 cumulative GPA.",
        "source_id": "S1",
        "evidence": "Applicants must maintain a 3.0 GPA.",
        "verification": {
          "verified": true,
          "matchType": "verbatim_exact",
          "confidence": 1.0,
          "wordCount": 6
        }
      }
    ],
    "gaps": [
      {
        "title": "Omission of renewal timeline and probationary periods",
        "why_it_matters": "Students cannot determine consequences if GPA drops.",
        "priority": "high",
        "sources_reviewed": ["S1", "S2"],
        "evidence": []
      }
    ],
    "conflicts": [
      {
        "topic": "Family income eligibility cutoff",
        "claim_a": {
          "claim": "Cutoff is $40,000 annually",
          "source_id": "S1",
          "evidence": "Income cutoff is $40,000.",
          "verification": { "verified": true }
        },
        "claim_b": {
          "claim": "Cutoff extends to $50,000 under priority review",
          "source_id": "S2",
          "evidence": "income under $50,000.",
          "verification": { "verified": true }
        }
      }
    ],
    "outdated": [],
    "unanswered_questions": [],
    "checklist": [
      {
        "item": "Confirm annual income ceiling with the financial aid bursar",
        "priority": "high",
        "reason": "Reconciles the $40,000 vs $50,000 threshold discrepancy",
        "verify_at": "Office of the Bursar / Financial Aid Officer",
        "related_sources": ["S1", "S2"]
      }
    ],
    "overall_confidence": "medium",
    "confidence_note": "Sources agree on basic qualifications but diverge on income limits.",
    "evidence_verification": {
      "totalChecked": 3,
      "verifiedCount": 3,
      "unverifiedCount": 0,
      "invalidSourceCount": 0,
      "verificationRate": "100.0%"
    },
    "sources": [ /* ... */ ]
  }
  ```

---

## Offline Sample Demo

Digital Dark Spot provides a fully functional, offline sample demonstration:
- **Zero API Dependency:** Runs entirely in the browser using precomputed verification findings from [`public/sample-data.js`](file:///Users/nitinsharma/Downloads/protfolio/public/sample-data.js).
- **Fictional Scholarship Corpus:** Includes three simulated sources (*S1 Official Guidelines*, *S2 Advisory Memo*, *S3 Student Aid Bulletin*) exploring complex income limits, GPA rules, and undocumented renewal conditions.
- **Complete Feature Access:** Renders the full results dashboard, verbatim evidence pills, slide-out Evidence Drawer, interactive checklist tracking, clipboard copy, and `.txt` export without initiating backend API calls.

To access, launch the application and click **Sample Demo** on the input card.

---

## Security & Known Limitations

### Security Protections
- **SSRF Defense:** The URL fetch service resolves hostnames prior to connection and blocks private IP ranges (RFC 1918), loopback interfaces (`127.0.0.1`, `localhost`), and cloud link-local metadata endpoints (`169.254.169.254`). All HTTP 301/302 redirects are validated across each hop.
- **Input Bounding:** Web page text extraction is strictly capped at $\le 12,000$ characters per source to guard against token flooding and memory exhaustion.
- **Credential Protection:** The `GEMINI_API_KEY` is confined to server-side operations and is never exposed in client scripts, responses, or error traces.
- **Fail-Safe UI Isolation:** Failed live analyses display inline error banners and clear active states; they never silently substitute sample data.

### Known Limitations
- **Rate and Quota Ceilings:** Quota limits (requests per day, requests per minute) are established by the user's Google AI Studio project and billing tier. When a project reaches its daily quota on `gemini-3.8-flash`, the service attempts `gemini-3.6-flash` or surfaces a clear tier notification (HTTP 429).
- **Format Support:** Current URL extraction focuses on HTML articles; raw binary files (PDF, DOCX) must currently be pasted as text.
- **Analytical Scope:** Detected gaps and contradictions represent discrepancies between the *provided* documents. The engine does not claim that unmentioned facts do not exist in sources outside the submitted corpus.

---

## Future Scope

- **Native Document Parsing:** Direct in-browser upload and parsing for PDF, DOCX, and EPUB research papers.
- **Academic Registry Cross-Referencing:** Automated lookup against CrossRef, arXiv, and PubMed identifiers to verify publication freshness and retraction status.
- **Export Formats:** One-click generation of formal PDF audit dossiers and machine-readable JSON research summaries.
- **Multi-Model Consensus:** Optional dual-evaluation combining Gemini with supplementary verification models for high-stakes intelligence analysis.
