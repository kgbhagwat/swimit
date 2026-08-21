import { useParams } from 'react-router-dom';
import { WorkflowDiagram } from './WorkflowDiagram';

export function HelpPage() {
  const { accountCode } = useParams<{ accountCode?: string }>();

  function resolveWorkflowPath(to: string) {
    if (!accountCode || !to.startsWith('/application/')) return to;
    return `/${accountCode}${to.slice('/application'.length)}`;
  }

  return (
    <div className="page platform-page workflow-help-page">
      <section className="pass-form-card workflow-help-page-card">
        <WorkflowDiagram resolveTo={resolveWorkflowPath} />
      </section>
    </div>
  );
}
