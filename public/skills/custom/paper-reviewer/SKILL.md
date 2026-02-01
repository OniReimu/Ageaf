---
name: paper-reviewer
description: This skill should be used when users request peer reviews of academic papers or manuscripts. It produces structured, evidence-based reviews following top-tier venue standards with no scores or accept/reject decisions. Activates on requests like "review this paper", "provide a peer review", or "analyze this manuscript".
---

# Paper Reviewer

## Overview

Generate comprehensive, evidence-based reviews of academic manuscripts following top-tier venue standards. The skill enforces rigorous evidence anchoring, maintains objectivity and constructive tone, and produces reviews without numerical scores or accept/reject decisions.

## When to Use This Skill

Activate when the user requests:
- Peer review of an academic paper or manuscript
- Structured analysis of research contributions
- Evaluation of scientific work for publication venues
- Feedback on manuscript strengths and weaknesses

## Review Workflow

### Step 1: Input Processing

Accept the manuscript in any format (PDF, plain text, markdown, OCR output).

Read the entire manuscript carefully, noting:
- Section structure (Introduction, Methods, Results, Discussion, etc.)
- All figures and tables with their numbers
- All equations with their numbers
- Page numbers for reference
- The references/bibliography section

### Step 2: Review Structure

Produce a review with EXACTLY these six sections in order (no additions, no omissions):

1. **Synopsis of the paper**
2. **Summary of Review**
3. **Strengths**
4. **Weaknesses**
5. **Suggestions for Improvement**
6. **References**

### Step 3: Write Each Section

#### Synopsis of the paper (≤150 words)

- Neutrally restate: the problem, the proposed method, core contributions, and main results
- Use objective language only
- Avoid subjective judgments or decision-like language
- Do not preview strengths or weaknesses

#### Summary of Review (3-5 sentences)

- Provide a balanced overview of both positives and concerns
- After EACH reason or claim, add an evidence anchor in parentheses
  - Examples: `(See Table 2)`, `(Sec. 4.1)`, `(Eq. (5))`, `(Fig. 3, p. 7)`
- If a claim lacks manuscript evidence, write: `(No direct evidence found in the manuscript.)`

#### Strengths (3-6 bullet points)

Focus on:
- Novelty and originality
- Technical soundness
- Experimental rigor (datasets, metrics, baselines)
- Clarity of presentation
- Potential impact

**CRITICAL**: Add evidence anchors to EVERY bullet point. Reference specific figures, tables, equations, sections, or pages.

#### Weaknesses (3-8 bullet points)

Focus on verifiable issues:
- Relation to closest prior work (missing comparisons, insufficient differentiation)
- Experimental breadth (limited datasets, missing metrics, insufficient ablations)
- Statistical rigor (no confidence intervals, no significance tests)
- Reproducibility gaps (missing hyperparameters, no code availability)
- Theoretical limitations (unstated assumptions, unexplored failure modes)

**CRITICAL**: Add evidence anchors to EVERY bullet point. When evidence is missing, explicitly state the gap (e.g., `No evidence found in Sec. 4; missing from Methods.`).

#### Suggestions for Improvement (4-8 recommendations)

Provide concrete, actionable recommendations:
- Add specific ablation studies
- Unify baseline settings and tuning budgets
- Report mean ± std/CI across multiple runs
- Include additional metrics (e.g., reliability diagrams, calibration plots)
- Release code and random seeds
- Expand related work discussion to cover specific papers
- Add failure case analysis

**Link each suggestion to 1-2 corresponding weaknesses** to make it verifiable and actionable.

#### References

- List ONLY items explicitly cited within this review AND appearing in the manuscript's reference list
- Use concise format: `[Author et al., Year]` or the manuscript's numbering style
- If no citations are needed or the reference list is unavailable, write: `None`

## Evidence-First Principle

**Every claim must be anchored to manuscript evidence.**

Good examples:
- "The method demonstrates strong performance on ImageNet (Table 3, p. 8)."
- "The ablation study isolates the contribution of each component (Sec. 5.2, Table 5)."
- "Hyperparameter settings are not reported (No evidence found in Methods section or appendices)."

Bad examples:
- "The method shows good results." (No anchor)
- "The paper is well-written." (Subjective, no anchor)
- "This approach is novel compared to [external work not in manuscript]." (External citation)

## Critical Constraints

**Mandatory constraints:**
- Use ONLY the six section headings listed above
- Do NOT include scores, ratings, confidence levels, or accept/reject decisions
- Do NOT guess authors, institutions, or affiliations
- Do NOT cite external sources unless they appear in the manuscript's reference list
- Do NOT make speculative claims

**Tone and style:**
- Objective and constructive
- Polite and professional
- Focus on improving the work, not criticizing the authors
- Use imperative/infinitive form for suggestions ("Add an ablation study" not "You should add")

**Length:**
- Target 400-600 words total
- Adjust as needed for manuscript complexity
- Synopsis: ≤150 words
- Other sections: balanced allocation

## Output Format

Produce plain text output using markdown formatting:
- Use `## ` for section headings
- Use `- ` for bullet points
- Use **bold** for emphasis sparingly
- Maintain consistent formatting throughout

## Resources

### references/

For detailed examples and additional guidance:
- `review_template.md` - Annotated section examples with real review snippets
- `evidence_anchoring.md` - Comprehensive guide to evidence citation patterns
