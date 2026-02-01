---
name: doc-coauthoring
description: Guide users through a structured workflow for co-authoring documentation. Use when user wants to write documentation, proposals, technical specs, decision docs, or similar structured content. This workflow helps users efficiently transfer context, refine content through iteration, and verify the doc works for readers. Trigger when user mentions writing docs, creating proposals, drafting specs, or similar documentation tasks.
---

# Doc Co-Authoring Workflow

This skill provides a structured workflow for guiding users through collaborative document creation. Act as an active guide, walking users through three stages: Context Gathering, Refinement & Structure, and Reader Testing.

## When to Offer This Workflow

**Trigger conditions:**
- User mentions writing documentation: "write a doc", "draft a proposal", "create a spec", "write up"
- User mentions specific doc types: "PRD", "design doc", "decision doc", "RFC"
- User seems to be starting a substantial writing task

**Initial offer:**
Offer the user a structured workflow for co-authoring the document. Explain the three stages:

1. **Context Gathering**: User provides all relevant context while Claude asks clarifying questions
2. **Refinement & Structure**: Iteratively build each section through brainstorming and editing
3. **Reader Testing**: Test the doc with a fresh Claude (no context) to catch blind spots before others read it

Explain that this approach helps ensure the doc works well when others read it (including when they paste it into Claude). Ask if they want to try this workflow or prefer to work freeform.

If user declines, work freeform. If user accepts, proceed to Stage 1.

## Stage 1: Context Gathering

**Goal:** Close the gap between what the user knows and what Claude knows, enabling smart guidance later.

### Initial Questions

Start by asking the user for meta-context about the document:

1. What type of document is this? (e.g., technical spec, decision doc, proposal)
2. Who's the primary audience?
3. What's the desired impact when someone reads this?
4. Is there a template or specific format to follow?
5. Any other constraints or context to know?

Inform them they can answer in shorthand or dump information however works best for them.

**If user provides a template or mentions a doc type:**
- Ask if they have a template document to share
- If they provide a link to a shared document, use the appropriate integration to fetch it
- If they provide a file, read it

**If user mentions editing an existing shared document:**
- Use the appropriate integration to read the current state
- Check for images without alt-text
- If images exist without alt-text, explain that when others use Claude to understand the doc, Claude won't be able to see them. Ask if they want alt-text generated. If so, request they paste each image into chat for descriptive alt-text generation.

### Info Dumping

Once initial questions are answered, encourage the user to dump all the context they have. Request information such as:
- Background on the project/problem
- Related team discussions or shared documents
- Why alternative solutions aren't being used
- Organizational context (team dynamics, past incidents, politics)
- Any solutions already considered
- Success metrics/criteria

Encourage them to share everything at once rather than drip-feeding.

### Clarifying Questions

After the user dumps context, ask clarifying questions to fill gaps. Focus on:
- Key decisions that aren't clear
- Missing constraints
- Unclear audience or goals

Ask questions in batches, but keep them manageable (3-5 at a time).

Stop when you have enough context to start drafting.

## Stage 2: Refinement & Structure

**Goal:** Build the document section by section through iteration.

### Propose a Structure

Based on the user's doc type and context, propose an outline. Use common patterns:

**Technical spec:**
- Summary / TL;DR
- Problem statement
- Goals / Non-goals
- Proposed solution
- Alternatives considered
- Risks and mitigations
- Rollout plan
- Open questions

**Decision doc:**
- Context
- Decision
- Rationale
- Alternatives
- Consequences

**Proposal:**
- Background
- Proposal
- Benefits
- Costs
- Risks
- Next steps

Ask if the outline looks right, and adjust based on feedback.

### Draft Incrementally

Work through the document in chunks:
- Write a section (or partial section)
- Ask for feedback
- Incorporate changes
- Move to the next section

Keep the user involved, but don't ask for approval on every sentence. Deliver concrete drafts they can react to.

### Maintain Consistency

Throughout drafting:
- Keep terminology consistent
- Ensure the narrative stays aligned with the goal/audience
- Track open questions and decisions that need confirmation

If you notice inconsistencies, call them out and suggest fixes.

## Stage 3: Reader Testing

**Goal:** Ensure the doc works for someone without context.

### The Test

Once the doc is in a good draft state:
- Ask the user to paste the full doc into a fresh Claude session (or you can simulate this by summarizing what you've learned and "resetting" context)
- Instruct the "fresh" reader to:
  - Summarize the doc
  - Identify unclear parts
  - List questions they still have
  - Point out assumptions the author seems to be making

### Fix Blind Spots

Use feedback from reader testing to:
- Add missing context
- Clarify confusing sections
- Make assumptions explicit
- Improve structure/flow

Repeat reader testing if the doc is high-stakes.

## Output Style

When co-authoring:
- Use clear headings and bullet lists
- Keep paragraphs short
- Prefer concrete language over vague statements
- Call out open questions explicitly (e.g., "Open question: ...")

If the user provides a template, follow it.

