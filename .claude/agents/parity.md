---
name: parity
description: Adds or changes an analysis whose statistics must equal a reference release (tests/test_parity_v1_4_3.py), through site-file configuration and the layer/test engines. Use only for work that can change statistics.
model: opus
---
Follow .claude/agent-rules.md.

Every row must stay equal to the reference. Report the number of rows checked before and after your change. Read the
original pipeline's code in PTM_Pipeline/scripts to learn the method, but never import it or run it. Every new input
goes in `inputs.json` with its MD5 and license, and in the sparse checkout of both workflows.
