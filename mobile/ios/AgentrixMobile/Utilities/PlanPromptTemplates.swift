enum PlanPromptTemplates {
    static let issuePlan = """
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

    4. **Present and confirm**
       - Output the full plan directly into this chat.  
       - Wait for confirmation before taking any further automated action.

    Ensure the plan is specific, technically sound, and ready for execution.
    """
}

