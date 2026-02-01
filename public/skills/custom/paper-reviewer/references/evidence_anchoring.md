# Evidence Anchoring Guide

This document provides comprehensive guidance on properly anchoring claims to manuscript evidence in academic peer reviews.

## The Evidence-First Principle

**Every substantive claim in a peer review must be verifiable from the manuscript.**

This means:
- Claims about results must cite specific tables, figures, or sections
- Claims about methods must reference equations, algorithms, or methodology sections
- Claims about missing elements must explicitly note where evidence should appear but doesn't
- Subjective opinions without evidence are not appropriate

## Evidence Anchor Formats

### Standard Anchor Patterns

**Tables**:
- `(Table 2)`
- `(See Table 3, row 4)`
- `(Tables 2-4)`

**Figures**:
- `(Figure 1)`
- `(Fig. 3, panel b)`
- `(Figs. 2 and 5)`

**Sections**:
- `(Section 4.1)`
- `(Sec. 3.2)`
- `(Introduction, Sec. 1)`

**Equations**:
- `(Equation 5)`
- `(Eq. (3))`
- `(Eqs. (2)-(4))`

**Pages**:
- `(page 7)`
- `(p. 12)`
- `(pp. 8-10)`

**Algorithms**:
- `(Algorithm 1)`
- `(Alg. 2, line 5)`

**Appendices**:
- `(Appendix A)`
- `(Supplementary Material, Section S2)`

### Combined Anchors

Often, multiple references strengthen a claim:

- `(Table 2, Section 4.3)`
- `(Figure 3 on page 7; Eq. (5))`
- `(Sec. 4.2, Tables 2-3)`
- `(Algorithm 1, line 8; see also Fig. 4)`

### Missing Evidence Anchors

When evidence should exist but doesn't:

- `(No evidence found in Methods section)`
- `(Missing from Section 4 and appendices)`
- `(Not reported in Tables 2-4 or elsewhere)`
- `(No hyperparameters specified in Sec. 4.1 or supplementary materials)`
- `(No direct evidence found in the manuscript.)`

## Examples by Section

### Synopsis of the paper

**Goal**: Establish what the paper claims without subjective judgment.

**Good**:
> The method achieves 94.2% accuracy on CIFAR-10 and 89.7% on ImageNet (Table 2).

**Bad**:
> The method achieves excellent results.

**Why**: "Excellent" is subjective; specific numbers from Table 2 are objective.

---

### Summary of Review

**Goal**: Every sentence should have at least one evidence anchor.

**Good**:
> The experimental evaluation is comprehensive, covering five attack methods and two datasets (Tables 2-3, Sec. 4.2). However, the comparison omits recent baselines from 2022-2023 (Table 3 includes only methods from 2018-2020).

**Bad**:
> The experiments are good but could include more baselines.

**Why**: Bad example lacks specificity and evidence anchors.

---

### Strengths

**Good Examples**:

1. **Novelty**:
   - `The gradient smoothing approach is, to our knowledge, the first to combine statistical testing with gradient variance analysis for adversarial detection (Sec. 3.1; no prior work in Sec. 2 uses this combination).`

2. **Technical soundness**:
   - `The theoretical analysis provides formal guarantees on false positive rates under clean data distributions (Theorem 1, Sec. 3.2, with proof in Appendix A).`

3. **Experimental rigor**:
   - `The evaluation includes 5 attack methods (FGSM, PGD, C&W, DeepFool, AutoAttack) with 3 perturbation budgets each (ε = 0.01, 0.03, 0.05), totaling 15 threat scenarios per dataset (Table 2, Sec. 4.2).`

4. **Clarity**:
   - `The method is clearly explained with step-by-step pseudocode (Algorithm 1) and intuitive visualizations of gradient distributions (Figure 2).`

5. **Reproducibility (when present)**:
   - `The authors provide comprehensive implementation details including network architectures (Table A1), hyperparameters (Table A2), and training procedures (Appendix B.1), with code available at the provided URL (Sec. 4.1, footnote 3).`

**Bad Examples**:

- `The method is novel.` (No evidence)
- `The experiments are thorough.` (No specifics)
- `The paper is well-organized.` (Subjective, no anchor)

---

### Weaknesses

**Good Examples**:

1. **Limited threat coverage**:
   - `The evaluation considers only ℓ∞ bounded attacks and does not evaluate ℓ2, ℓ1, or unbounded perturbations (Table 2 specifies only ℓ∞ with ε values; no other threat models in Sec. 4).`

2. **Missing baselines**:
   - `The comparison omits several state-of-the-art defenses published in 2022-2023, including [Author et al., 2022] and [Author et al., 2023] which report stronger performance on the same datasets (Table 3 includes only 4 baselines from 2018-2020; these works appear in the manuscript's reference list as [15] and [23] but are not compared).`

3. **Statistical rigor**:
   - `Results lack error bars, confidence intervals, or significance tests. All numbers in Tables 2-4 are point estimates without standard deviations or indications of multiple runs.`

4. **Reproducibility gaps**:
   - `Baseline hyperparameters are not specified, making it unclear if comparisons are fair (Sec. 4.2 mentions "default settings" but Table A2 in appendix lists hyperparameters only for the proposed method, not baselines).`

5. **Assumptions not validated**:
   - `The method assumes gradient distributions are Gaussian (Assumption 1, Sec. 3.2), but no empirical validation of this assumption on real data is provided (no distribution plots or goodness-of-fit tests in Sec. 4, Fig. 2 shows only illustrative examples).`

6. **Limited dataset coverage**:
   - `The evaluation uses only CIFAR-10 and ImageNet; other common benchmarks like MNIST, SVHN, or Tiny-ImageNet are not included (Sec. 4.1 specifies only these two datasets).`

7. **Failure mode analysis lacking**:
   - `The paper reports aggregate detection rates but does not analyze failure cases, characterize adversarial examples that evade detection, or discuss when the method fails (Tables 2-3 show overall accuracy; no per-sample analysis, confusion matrices, or failure case discussion in Sec. 4 or 5).`

**Bad Examples**:

- `More datasets are needed.` (Not specific, no anchor)
- `The evaluation is limited.` (Vague, no evidence)
- `Some details are missing.` (Not actionable, no specifics)

---

### Suggestions for Improvement

**Structure**: `[Action verb] [specific recommendation] [optional: how/why]. This addresses [Weakness X].`

**Good Examples**:

1. **Expanding threat models**:
   - `Evaluate the defense against ℓ2 and ℓ1 bounded attacks using the same attack methods (FGSM, PGD, C&W adapted for different norms) to demonstrate robustness across threat models. This addresses the limited threat coverage (Weakness 1).`

2. **Adding baselines**:
   - `Include comparisons with recent defenses [Author et al., 2022] and [Author et al., 2023] using the same evaluation protocol, datasets, and hyperparameter tuning budget as the proposed method. Report results in an expanded Table 3. This addresses missing recent baselines (Weakness 2).`

3. **Statistical rigor**:
   - `Report mean ± standard deviation across 3-5 random seeds for all experimental results. Include 95% confidence intervals in tables and error bars in figures. Perform paired t-tests when comparing methods and report p-values. This addresses missing statistical significance (Weakness 3).`

4. **Reproducibility**:
   - `Specify all hyperparameters for baseline methods in Appendix A (learning rates, batch sizes, optimizers, number of epochs, etc.). Release code, trained models, and data preprocessing scripts in a public repository. This addresses reproducibility concerns (Weakness 4).`

5. **Validating assumptions**:
   - `Add an ablation study (e.g., new Sec. 5.3) that empirically validates the Gaussian gradient distribution assumption by plotting gradient distributions on CIFAR-10 and ImageNet with Q-Q plots and Kolmogorov-Smirnov tests. Discuss implications when the assumption is violated. This addresses unvalidated assumptions (Weakness 5).`

6. **Dataset coverage**:
   - `Extend the evaluation to additional datasets (MNIST, SVHN, Tiny-ImageNet) to demonstrate generalization across different image characteristics and complexities. Add results to Table 2. This addresses limited dataset coverage (Weakness 6).`

7. **Failure analysis**:
   - `Add a new subsection (e.g., Sec. 4.5) analyzing failure modes: identify adversarial examples with low detection confidence, visualize their gradient distributions, and characterize properties that make them harder to detect. Include a confusion matrix and per-attack-method breakdown. This addresses the lack of failure mode analysis (Weakness 7).`

**Bad Examples**:

- `Add more experiments.` (Not specific)
- `Improve the evaluation.` (Not actionable)
- `Fix the reproducibility issues.` (Vague)
- `Consider additional datasets.` (Not concrete, no link to weakness)

---

## Common Pitfalls and How to Avoid Them

### Pitfall 1: Vague Claims

**Bad**: `The method performs well.`

**Good**: `The method achieves 94.2% detection rate on CIFAR-10 against PGD attacks with ε=0.03 (Table 2, row 3).`

### Pitfall 2: Subjective Judgments

**Bad**: `The paper is impressive and makes important contributions.`

**Good**: `The paper introduces a novel statistical test for adversarial detection (Sec. 3.2, Eq. (5)) and provides theoretical guarantees on false positive rates (Theorem 1), which prior work in Sec. 2 does not offer.`

### Pitfall 3: Missing Evidence Anchors

**Bad**: `The ablation study shows the importance of each component.`

**Good**: `The ablation study systematically removes each component (gradient smoothing, variance thresholding, statistical test) and measures the impact on detection rate, showing degradation of 5-12% when each is removed (Table 5, Sec. 5.1).`

### Pitfall 4: External Citations

**Bad**: `This method is similar to [some external paper not cited in manuscript].`

**Good**: `The method shares conceptual similarity with gradient-based detection approaches (see Sec. 2, Related Work, specifically [Author et al., 2019] in the manuscript's reference list).`

### Pitfall 5: Not Noting Missing Evidence

**Bad**: `The method should be more robust.` (Implies evaluation exists but is insufficient)

**Good**: `Robustness to adaptive attacks is not evaluated; Sec. 4 considers only standard attacks where the adversary is unaware of the defense (no adaptive evaluation found in experiments or discussion).`

---

## Quick Reference Checklist

Before finalizing a review, check:

- [ ] Every bullet in Strengths has an evidence anchor
- [ ] Every bullet in Weaknesses has an evidence anchor OR explicitly notes missing evidence
- [ ] Every sentence in Summary of Review has at least one evidence anchor
- [ ] All evidence anchors reference specific manuscript elements (tables, figures, sections, equations, pages)
- [ ] Missing evidence is explicitly noted with phrases like "No evidence found in Sec. X"
- [ ] No external sources are cited unless they appear in the manuscript's reference list
- [ ] No subjective judgments without objective support
- [ ] All suggestions link to specific weaknesses
- [ ] Claims are verifiable by reading the manuscript

---

## Evidence Anchor Density Guidelines

**Summary of Review**: 3-5 sentences, 3-5 evidence anchors (at least 1 per sentence, some sentences may have multiple)

**Strengths**: 3-6 bullets, 3-6 evidence anchors (1 per bullet minimum, complex bullets may have 2-3)

**Weaknesses**: 3-8 bullets, 3-8 evidence anchors (1 per bullet minimum, many will note missing evidence)

**Suggestions**: 4-8 items, each linked to 1-2 weaknesses (direct linkage counts as "evidence" of improvement need)

---

## Final Notes

Evidence anchoring is what transforms a review from opinion into rigorous peer evaluation. When reviewers support every claim with manuscript evidence, authors can:

1. Verify each point by checking the cited location
2. Understand exactly what prompted each comment
3. Respond effectively with counter-evidence or revisions
4. Trust that the review is fair and grounded in their work

When evidence is missing from the manuscript, explicitly noting the gap is equally important—it signals to authors what information needs to be added.
