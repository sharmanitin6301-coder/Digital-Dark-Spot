/**
 * Digital Dark Spot — Offline Sample Dataset (Step 4)
 *
 * IMPORTANT: All sources and analyses contained herein are strictly FICTIONAL and
 * constructed deliberately for offline demonstration, testing, and evaluation.
 * They do NOT represent authentic institutions, official guidelines, or live websites.
 */

(function () {
  'use strict';

  // 1. THREE DELIBERATELY CRAFTED FICTIONAL SOURCES
  const SAMPLE_SOURCES = [
    {
      id: 'S1',
      type: 'url',
      url: 'https://sample.digitaldarkspot.local/official-scholarship-guide-2026',
      title: 'National Higher Education Merit Grant — Official Operational Guidelines (Fictional Sample)',
      detectedDate: '2026-08-15',
      fetchStatus: 'success',
      error: null,
      text: `[FICTIONAL SAMPLE SOURCE S1 - FOR DEMONSTRATION PURPOSES ONLY]

National Higher Education Merit Grant — Official Operational Guidelines (Academic Year 2026-2027)
Published by Department of Collegiate Aid & Student Welfare (Fictional Entity)
Notice Reference: MERIT/2026/SEC-04
Date of Notification: 15 August 2026

1. SCOPE AND ELIGIBILITY CRITERIA:
Undergraduate applicants are eligible to submit candidatures for the national merit award across all accredited degree programs. Applicants must be enrolled full-time in an approved higher education institution. The family income limit is ₹3,00,000 per annum from all verifiable sources combined. Applicants exceeding this gross household threshold will be deemed ineligible.

2. MANDATORY VERIFICATION DOCUMENTATION:
All candidates must submit verified proof of admission alongside standard financial records. A current family income certificate is required issued by a designated revenue authority not earlier than six months prior to the date of submission. Applications lacking this document will be summarily rejected during administrative scrutiny. Affidavits, informal letters, or employer slips are not acceptable substitutes.

3. CALENDAR AND TIMELINES:
The portal opened for electronic registrations on 01 September 2026. The official application deadline is 30 November 2026. No extensions will be granted under any circumstances.

[Administrative Note: Multi-year retention criteria and subsequent disbursement regulations are administered under independent circulars; renewal conditions are not mentioned in the supplied text.]`
    },
    {
      id: 'S2',
      type: 'url',
      url: 'https://sample.digitaldarkspot.local/campus-advisory-blog-2026',
      title: 'Campus & Career Guidance Blog — Student Aid Digest (Fictional Sample)',
      detectedDate: '2026-09-02',
      fetchStatus: 'success',
      error: null,
      text: `[FICTIONAL SAMPLE SOURCE S2 - FOR DEMONSTRATION PURPOSES ONLY]

Student Career & Scholarship Advisory Digest
Article: "Maximizing Your Chances for Higher Education Merit Grants"
Published: 02 September 2026

Recent updates from regional scholarship coordinators suggest several administrative relaxations for the current admissions season. While conventional wisdom cites strict cut-offs, student counselors report that an annual family income up to ₹4,00,000 may qualify under certain category quotas and institutional discretionary allocations. Middle-income applicants are therefore encouraged to apply rather than assuming immediate disqualification.

Furthermore, several institutions have reported that a self-declaration may be accepted instead of an income certificate during initial screening if revenue office delays prevent prompt issuance of stamped certificates. Candidates should nevertheless initiate their certificate requests early.

Multi-Year Retention Advice: Securing the award is only step one. Students should plan their study habits carefully: recipients should maintain a minimum CGPA of 7.0 for renewal across consecutive semesters without active backlogs. Always verify institutional circulars before submitting.`
    },
    {
      id: 'S3',
      type: 'url',
      url: 'https://sample.digitaldarkspot.local/community-forum-archive-2024',
      title: 'HigherEd Student Community Forum Archive (Fictional 2024 Archive)',
      detectedDate: '2024-10-18',
      fetchStatus: 'success',
      error: null,
      text: `[FICTIONAL SAMPLE SOURCE S3 - FOR DEMONSTRATION PURPOSES ONLY]

HigherEd Discussion Board Archive (Thread #4418 - Academic Year 2024-2025)
Board: Financial Aid Discussion & Historical Cutoffs
Archived Thread Date: 18 October 2024
Moderator Note: This thread is closed and preserved for historical reference only.

Post #1 by @edupath_moderator:
"Please be advised that the 2024 application deadline was 15 October 2024. Late submissions are strictly locked out of the portal. For this completed cycle, the income limit was ₹2,50,000. Many applicants whose parents earned above 2.5 Lakhs were disqualified during scrutiny.

Note that this information relates to an older application cycle. Parameters, ceilings, and portals are subject to annual fiscal revision. Please consult current operational notices for active application years."`
    }
  ];

  // 2. PRECOMPUTED STRUCTURED ANALYSIS (MATCHING EXISTING /api/analyze SCHEMA)
  const SAMPLE_ANALYSIS = {
    success: true,
    isSampleDemo: true,
    question: 'What should I verify about eligibility criteria, renewal conditions, and repayment obligations before applying for scholarships and aid?',
    model: 'SAMPLE DATA (Precomputed Offline Engine)',
    overall_confidence: 'medium',
    confidence_note: 'Medium confidence: Significant direct contradictions exist between Official Guidelines (S1) and Education Blog (S2) regarding income thresholds and required documentation, while Forum Archive (S3) contains outdated 2024 parameters.',

    // Structured Factual Summary (Section A)
    summary: [
      {
        point: 'Undergraduate applicants enrolled full-time are eligible for the national grant.',
        source_id: 'S1',
        evidence: 'Undergraduate applicants are eligible',
        verification: { verified: true, status: 'verified', word_count: 4 }
      },
      {
        point: 'The official family income ceiling is specified as ₹3,00,000 per annum.',
        source_id: 'S1',
        evidence: 'family income limit is ₹3,00,000',
        verification: { verified: true, status: 'verified', word_count: 5 }
      },
      {
        point: 'The current official application deadline is set for 30 November 2026.',
        source_id: 'S1',
        evidence: 'application deadline is 30 November 2026',
        verification: { verified: true, status: 'verified', word_count: 6 }
      },
      {
        point: 'Advisory guidance claims recipients must sustain a 7.0 CGPA for grant continuation.',
        source_id: 'S2',
        evidence: 'recipients should maintain a minimum CGPA of 7.0 for renewal',
        verification: { verified: true, status: 'verified', word_count: 10 }
      },
      {
        point: 'Community forum records show older deadlines and lower historical income ceilings from a prior cycle.',
        source_id: 'S3',
        evidence: 'information relates to an older application cycle',
        verification: { verified: true, status: 'verified', word_count: 7 }
      }
    ],

    // Potential Information Gaps (Section B)
    gaps: [
      {
        title: 'Official Renewal & Multi-Year Continuation Criteria Unstated',
        why_it_matters: 'The Official Guide (S1) omits academic performance standards required to retain funding. While third-party blog S2 suggests a 7.0 CGPA cutoff, official retention rules are missing.',
        priority: 'high',
        sources_reviewed: ['S1', 'S2', 'S3'],
        sources_reviewed_valid: true,
        evidence: [
          {
            source_id: 'S1',
            snippet: 'renewal conditions are not mentioned in the supplied text',
            verification: { verified: true, status: 'verified', word_count: 9 }
          },
          {
            source_id: 'S2',
            snippet: 'recipients should maintain a minimum CGPA of 7.0 for renewal',
            verification: { verified: true, status: 'verified', word_count: 10 }
          }
        ]
      },
      {
        title: 'Clawback & Repayment Obligations on Withdrawal Absent',
        why_it_matters: 'None of the provided sources specify whether funds convert to an interest-bearing debt if a student drops below full-time enrollment, transfers, or withdraws.',
        priority: 'high',
        sources_reviewed: ['S1', 'S2', 'S3'],
        sources_reviewed_valid: true,
        evidence: []
      },
      {
        title: 'Discretionary Category Quota Rules Undefined in Official Text',
        why_it_matters: 'Blog S2 claims higher incomes qualify under category quotas, but the official source defines no specific quota rules or income relaxation procedures.',
        priority: 'medium',
        sources_reviewed: ['S1', 'S2'],
        sources_reviewed_valid: true,
        evidence: [
          {
            source_id: 'S2',
            snippet: 'annual family income up to ₹4,00,000 may qualify',
            verification: { verified: true, status: 'verified', word_count: 8 }
          }
        ]
      }
    ],

    // Potential Conflicts (Section C)
    conflicts: [
      {
        topic: 'Annual Family Income Eligibility Cap',
        claim_a: {
          claim: 'Family income limit is strictly capped at ₹3,00,000 per annum from all sources.',
          source_id: 'S1',
          evidence: 'family income limit is ₹3,00,000',
          verification: { verified: true, status: 'verified', word_count: 5 }
        },
        claim_b: {
          claim: 'Annual family income up to ₹4,00,000 may qualify under certain category quotas.',
          source_id: 'S2',
          evidence: 'annual family income up to ₹4,00,000 may qualify',
          verification: { verified: true, status: 'verified', word_count: 8 }
        }
      },
      {
        topic: 'Mandatory Financial Verification Document',
        claim_a: {
          claim: 'A current family income certificate from a designated revenue authority is strictly required.',
          source_id: 'S1',
          evidence: 'A current family income certificate is required',
          verification: { verified: true, status: 'verified', word_count: 7 }
        },
        claim_b: {
          claim: 'A self-declaration may be accepted in lieu of an official certificate during initial screening.',
          source_id: 'S2',
          evidence: 'a self-declaration may be accepted instead of an income certificate',
          verification: { verified: true, status: 'verified', word_count: 10 }
        }
      }
    ],

    // Outdated Information Signals (Section D)
    outdated: [
      {
        signal: 'Expired 2024 Application Deadline & Outdated ₹2,50,000 Income Limit',
        source_id: 'S3',
        detected_date: '2024-10-18',
        reason: 'Community thread S3 documents a 15 October 2024 deadline and ₹2,50,000 limit from an older cycle. Applicants following S3 risk confusion with the active 30 November 2026 deadline.',
        evidence: '2024 application deadline was 15 October 2024',
        verification: { verified: true, status: 'verified', word_count: 7 }
      }
    ],

    // Unanswered Questions (Section E)
    unanswered_questions: [
      {
        question: 'What are the official minimum GPA / CGPA renewal thresholds for subsequent academic years?',
        why_it_matters: 'The official source S1 contains no renewal standards. Students relying on aid need official confirmation of multi-year retention rules.',
        related_sources: ['S1', 'S2']
      },
      {
        question: 'Under what specific conditions do category quotas permit household income above ₹3,00,000?',
        why_it_matters: 'Applying with ₹3,50,000 income on the basis of blog advice could trigger immediate rejection if quotas require specific government documentation.',
        related_sources: ['S1', 'S2']
      },
      {
        question: 'Does the grant carry repayment liabilities or clawback clauses if a student changes degree programs?',
        why_it_matters: 'No reviewed source provides terms regarding award repayment or institutional transfer obligations.',
        related_sources: ['S1']
      }
    ],

    // Prioritized Verification Checklist (Section 4)
    checklist: [
      {
        item: 'Verify active family income ceiling on the official 2026 government portal',
        priority: 'high',
        reason: 'Resolve the discrepancy between S1 (₹3,00,000 limit) and S2 (₹4,00,000 quota claim) to ensure eligibility.',
        verify_at: 'Official State/National Grant Portal (Academic Year 2026-2027 Gazette)',
        related_sources: ['S1', 'S2']
      },
      {
        item: 'Confirm whether designated revenue authority certificate is mandatory at submission',
        priority: 'high',
        reason: 'S1 requires a stamped revenue certificate; submitting a self-declaration (S2) may cause rejection if informal papers are disallowed.',
        verify_at: 'Institutional Scholarship Cell & District Revenue Office',
        related_sources: ['S1', 'S2']
      },
      {
        item: 'Obtain official renewal circular to verify GPA standards for consecutive terms',
        priority: 'medium',
        reason: 'S1 omits continuation criteria; confirm whether S2\'s 7.0 CGPA claim is accurate.',
        verify_at: 'University Academic Registrar & Financial Aid Bureau',
        related_sources: ['S1', 'S2']
      },
      {
        item: 'Confirm 30 November 2026 submission deadline and disregard archived 2024 cutoff',
        priority: 'medium',
        reason: 'Prevent confusion from S3\'s expired 15 October 2024 deadline.',
        verify_at: 'Live Scholarship Portal Announcement Board',
        related_sources: ['S1', 'S3']
      },
      {
        item: 'Request written terms on grant clawback or conversion to loan upon program withdrawal',
        priority: 'medium',
        reason: 'All supplied sources lack terms regarding repayment obligations if degree status changes.',
        verify_at: 'Campus Financial Aid Agreement Terms & Conditions',
        related_sources: ['S1']
      }
    ],

    // Evidence Verification Audit Metrics
    evidence_verification: {
      totalChecked: 9,
      verifiedCount: 9,
      unverifiedCount: 0,
      invalidSourceCount: 0
    },

    // Source Manifest Records
    sources: SAMPLE_SOURCES
  };

  // Expose to window/globalThis for client-side offline execution
  const demoPayload = {
    sources: SAMPLE_SOURCES,
    analysis: SAMPLE_ANALYSIS,
    question: SAMPLE_ANALYSIS.question
  };

  if (typeof window !== 'undefined') {
    window.SAMPLE_DEMO_DATA = demoPayload;
  }
  if (typeof globalThis !== 'undefined') {
    globalThis.SAMPLE_DEMO_DATA = demoPayload;
  }
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = demoPayload;
  }

})();
