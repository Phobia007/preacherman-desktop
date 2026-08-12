export function createPreachermanExecutionApprovalAdapter({ client, taskService, actor = "preacherman-user" }) {
  async function decide(taskId, { approvalId, decision }) {
    const task = await taskService.get(taskId);
    const approval = task.pendingApproval;
    if (!approval) {
      const decided = task.approvalHistory?.find((candidate) => candidate.approvalId === approvalId && candidate.status === decision);
      if (decided) return { task, reused: true };
      const error = new Error("No matching approval is pending.");
      error.code = "TASK_APPROVAL_NOT_FOUND";
      error.statusCode = 404;
      throw error;
    }
    if (approval.approvalId !== approvalId) {
      const error = new Error("Approval identity does not match the pending request.");
      error.code = "TASK_APPROVAL_MISMATCH";
      error.statusCode = 409;
      throw error;
    }
    if (!new Set(["approved", "rejected"]).has(decision)) {
      const error = new Error("Approval decision must be approved or rejected.");
      error.code = "TASK_APPROVAL_INVALID";
      error.statusCode = 400;
      throw error;
    }
    const attempt = task.attempts.at(-1);
    if (!approval.nodeId || attempt?.provider !== "preacherman-execution" || !attempt.externalRunId) {
      const error = new Error("Approval is not linked to a Preacherman Execution node.");
      error.code = "PREACHERMAN_EXECUTION_APPROVAL_LINK_MISSING";
      error.statusCode = 409;
      throw error;
    }
    await client.approveRun(attempt.externalRunId, approval.nodeId, {
      decision,
      actor,
      proposal_hash: approval.proposalHash,
    });
    return {
      task: await taskService.resolveApproval(taskId, {
        approvalId,
        proposalHash: approval.proposalHash,
        decision,
        actor,
      }),
      reused: false,
    };
  }

  return { decide };
}
