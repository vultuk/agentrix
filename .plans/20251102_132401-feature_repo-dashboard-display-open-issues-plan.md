The 'dashboard' for a repo (when you click 'main' instead of a worktree) should list all the current open issues for that repository. It should get this information from the gh command in the same way we currently get the count' of issues. It should show the title, the tags, and the date it was opened. There should be 2 buttons next to each issue, one should directly open the issue in Github (in a new tab), the other should create a 'plan' using the following prompt (in the same default llm that the user uses for creating branches and other plans) and load it into the standard 'create from prompt' modal.

The prompt is as follows (please use this EXACT prompt), replacing <ISSUE_NUMBER> with the issue number chosen.

```
Using the gh command, load the specified GitHub issue and produce a structured plan to resolve or implement it.

1. **Load the issue context**
   - Retrieve the issue and its comments using:
     `gh issue view <ISSUE_NUMBER> --comments --json title,body,comments,author,url`
   - Parse and analyse:
       • The main issue description and intent.  
       • All comments and discussion for clarifications or context.  
       • Any related links, dependencies, or blockers.

2. **Analyse and understand**
   - Determine the core objective or bug to fix.  
   - Identify the affected components, modules, or systems.  
   - Extract any proposed solutions or developer notes.  
   - Spot missing information or ambiguities that require assumption or clarification.

3. **Generate a plan of action**
   - Draft a clear, technical, and step-by-step plan including:
       • **Summary:** One-sentence goal of the issue.  
       • **Analysis:** Understanding of the root cause or feature requirements.  
       • **Implementation Plan:** Ordered list of code changes, refactors, or new files needed.  
       • **Testing/Validation:** How to verify success.  
       • **Potential Risks / Edge Cases.**  
       • **Estimated Effort / Time.**

4. **Present and confirm**
   - Output the full plan directly into this chat.  
   - Ask:  
     “Would you like me to start working on this now?”  
   - Wait for confirmation before taking any further automated action.

Ensure the plan is specific, technically sound, and ready for execution.
```
