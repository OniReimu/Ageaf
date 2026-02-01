# Review Template with Annotated Examples

This document provides detailed examples for each section of an academic peer review.

## Synopsis of the paper

**Goal**: Neutrally restate the problem, method, contributions, and results in ≤150 words.

**Good Example**:

> This paper addresses the challenge of detecting adversarial examples in deep neural networks. The authors propose a novel defense method called "Gradient Smoothing" that analyzes the gradient distribution of input samples to identify adversarial perturbations. The core contribution is a statistical test based on gradient variance that distinguishes clean from adversarial inputs without requiring model retraining. The method is evaluated on CIFAR-10 and ImageNet against FGSM, PGD, and C&W attacks. The authors report detection rates of 94.2% on CIFAR-10 and 89.7% on ImageNet while maintaining low false positive rates (3.1% and 5.4% respectively).

**What makes this good**:
- Objective, neutral tone
- Covers: problem, method, contribution, results
- Specific but concise
- No subjective judgments
- Within 150 words

**Bad Example**:

> This excellent paper tackles the important problem of adversarial robustness. The innovative approach works really well and shows impressive results. The authors demonstrate their method on standard datasets and achieve good performance.

**Why this is bad**:
- Subjective language ("excellent", "innovative", "impressive")
- Vague ("works really well", "good performance")
- Missing specific details about the method
- No concrete results mentioned

---

## Summary of Review

**Goal**: Provide 3-5 sentences with balanced pros/cons, each with evidence anchors.

**Good Example**:

> The paper presents a computationally efficient defense method with strong empirical results on two benchmark datasets (Tables 2-3, Sec. 4.2). The statistical foundation is well-motivated and clearly explained (Sec. 3.1, Eq. (2)-(4)). However, the evaluation is limited to white-box attacks and does not consider adaptive adversaries aware of the defense mechanism (Sec. 4 evaluates only standard attacks). Additionally, the method's robustness to different gradient masking techniques remains unexplored (No evidence found in Sec. 4 or ablations). The paper would benefit from broader threat model coverage and analysis of defense limitations.

**What makes this good**:
- Balanced (2 strengths, 2 weaknesses, 1 suggestion)
- Every claim has an evidence anchor
- Specific citations to tables, sections, equations
- Explicitly notes missing evidence
- 5 sentences total

**Bad Example**:

> The paper has some good ideas but also several issues. The experiments seem reasonable. More work could be done to improve the evaluation. The writing is clear. Overall, this is a decent contribution.

**Why this is bad**:
- No evidence anchors
- Vague claims ("good ideas", "several issues", "seem reasonable")
- No specific strengths or weaknesses
- No manuscript references

---

## Strengths

**Goal**: 3-6 bullets focusing on novelty, soundness, rigor, clarity, impact. Every bullet needs evidence anchors.

**Good Example**:

- **Strong empirical validation across threat models**: The paper evaluates against 5 different attack methods (FGSM, PGD, C&W, DeepFool, AutoAttack) with varying perturbation budgets, demonstrating consistent detection performance (Table 2, Fig. 3).
- **Theoretically grounded approach**: The statistical test is derived from gradient distribution theory with formal guarantees on false positive rates under clean data assumptions (Theorem 1, Sec. 3.2, Eq. (6)).
- **Computational efficiency**: The method adds only 12ms overhead per sample compared to 340ms for competing defense methods (Table 4, Sec. 4.4).
- **Thorough ablation study**: The authors systematically analyze the impact of key hyperparameters (smoothing window size, confidence threshold) and design choices (gradient norm vs. variance) with clear performance trends (Sec. 5.1, Fig. 5-6).

**What makes this good**:
- Each bullet has specific evidence (tables, figures, sections, equations)
- Focuses on verifiable strengths
- Concrete details (numbers, method names)
- Covers multiple dimensions (empirical, theoretical, practical, ablations)

**Bad Example**:

- The method is novel and interesting
- The experiments show good results
- The paper is well-written and easy to follow

**Why this is bad**:
- No evidence anchors at all
- Subjective judgments ("interesting", "well-written")
- Vague ("good results")
- Not verifiable from the manuscript

---

## Weaknesses

**Goal**: 3-8 bullets on verifiable issues. Evidence anchor every bullet; explicitly note missing evidence.

**Good Example**:

- **Limited threat model coverage**: The evaluation considers only standard white-box attacks and does not evaluate adaptive attacks where the adversary is aware of the defense mechanism (Sec. 4 mentions only FGSM, PGD, C&W; no adaptive evaluation in Sec. 4.3 or elsewhere).
- **Insufficient comparison with recent defenses**: The baseline comparison includes only methods from 2018-2019 and omits recent state-of-the-art defenses published in 2021-2022 (Table 3 shows only 4 baselines; Related Work in Sec. 2 does not cite [Author et al., 2022] or similar recent work).
- **Missing statistical significance**: Results are reported as single numbers without confidence intervals, standard deviations, or significance tests across multiple runs (Tables 2-4 show point estimates only; no error bars in Fig. 3).
- **Reproducibility concerns**: Hyperparameters for baseline methods are not specified, and no code or supplementary materials are mentioned for reproducibility (No evidence found in Sec. 4, appendices, or elsewhere).
- **Failure mode analysis lacking**: The paper does not analyze when or why the method fails, nor does it characterize the types of adversarial examples that evade detection (Sec. 4.2 reports aggregate accuracy but no per-sample analysis or failure cases).
- **Overly restrictive assumptions**: The theoretical guarantees assume Gaussian gradient distributions (Assumption 1, Sec. 3.2), but no empirical validation of this assumption on real data is provided (No evidence in Sec. 4 or appendices).

**What makes this good**:
- Every bullet has evidence anchors
- Explicitly notes missing evidence
- Specific about what's missing and where it should be
- Verifiable from the manuscript
- Covers multiple dimensions (threat models, baselines, statistics, reproducibility, analysis, assumptions)

**Bad Example**:

- The evaluation is weak
- More datasets are needed
- The related work section could be better
- Some technical details are unclear

**Why this is bad**:
- No evidence anchors
- Vague ("weak", "could be better", "unclear")
- Not actionable
- Not verifiable

---

## Suggestions for Improvement

**Goal**: 4-8 concrete, actionable recommendations linked to 1-2 weaknesses.

**Good Example**:

1. **Evaluate against adaptive attacks**: Add experiments where the adversary is aware of the defense mechanism and specifically tries to evade gradient-based detection. This addresses the limited threat model coverage (Weakness 1).

2. **Expand baseline comparison**: Include recent state-of-the-art defenses from 2021-2022 (e.g., [Author et al., 2022], [Author et al., 2021]) with unified hyperparameter tuning budgets and consistent evaluation protocols. This addresses insufficient baseline coverage (Weakness 2).

3. **Report statistical significance**: Provide mean ± standard deviation or 95% confidence intervals across at least 3 random seeds for all experimental results. Include significance tests (e.g., paired t-test) when comparing methods. This addresses missing statistical rigor (Weakness 3).

4. **Ensure reproducibility**: Release code, trained models, and detailed hyperparameter configurations for all experiments. Document baseline hyperparameters explicitly in the appendix. This addresses reproducibility concerns (Weakness 4).

5. **Analyze failure modes**: Add a subsection analyzing when the defense fails, characterizing adversarial examples that evade detection, and visualizing their properties. Include per-sample detection confidence distributions. This addresses the lack of failure analysis (Weakness 5).

6. **Validate theoretical assumptions**: Empirically verify the Gaussian gradient distribution assumption (Assumption 1) by plotting gradient distributions on CIFAR-10 and ImageNet with statistical goodness-of-fit tests. This addresses overly restrictive assumptions (Weakness 6).

**What makes this good**:
- Concrete and actionable (specific experiments, metrics, analyses)
- Each linked to 1-2 weaknesses by number
- Specific methods mentioned (paired t-test, goodness-of-fit tests)
- Clear about what to add (code, subsection, experiments)
- Verifiable

**Bad Example**:

- Add more experiments
- Improve the writing
- Include more baselines
- Fix the issues

**Why this is bad**:
- Not specific ("more experiments" - which ones?)
- Not actionable ("improve the writing" - how?)
- Not linked to weaknesses
- Vague

---

## References

**Goal**: List ONLY items cited in this review AND in the manuscript's reference list.

**Good Example (when citations are used)**:

- [Author et al., 2022] "Recent Defense Method", Conference 2022
- [Author et al., 2021] "Another Defense", Journal 2021

**Good Example (when no citations needed)**:

None

**Bad Example**:

- [Some external paper not in manuscript]
- [Another paper I think is relevant]

**Why this is bad**:
- Cites external sources not in the manuscript
- Violates the constraint to only cite what's in the manuscript

---

## Summary of Key Principles

1. **Evidence anchors are mandatory** for every claim in Summary, Strengths, and Weaknesses
2. **Explicitly note missing evidence** when claims can't be verified
3. **Use specific citations**: table/figure numbers, section numbers, equation numbers, page numbers
4. **Link suggestions to weaknesses** by number or clear reference
5. **Maintain objectivity**: no scores, no decisions, no subjective praise
6. **Be constructive**: focus on improving the work, not criticizing authors
7. **Be specific**: concrete details, not vague statements
8. **Be verifiable**: everything should be checkable from the manuscript
