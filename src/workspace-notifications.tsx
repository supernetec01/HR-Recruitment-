import { date } from './api';
import { EvaluationButton } from './interview-evaluations';
import { t } from './locale';
import type { Interview, User } from './types';
import { Modal } from './ui';

type Props = {
  evaluations: Interview[];
  requests: number;
  submissions: number;
  user: User;
  onClose: () => void;
  onEvaluation: (interview: Interview) => void;
  onRequests: () => void;
  onSubmissions: () => void;
};

export function WorkspaceNotifications({
  evaluations, requests, submissions, user, onClose, onEvaluation, onRequests, onSubmissions,
}: Props) {
  return <Modal title={t('Thông báo')} onClose={onClose}>
    <div className="modal-body workspace-notifications">
      {requests > 0 && <button className="button secondary" onClick={onRequests}>
        {t('{count} yêu cầu phỏng vấn chờ xử lý', { count: requests })}
      </button>}
      {submissions > 0 && <button className="button secondary" onClick={onSubmissions}>
        {t('{count} hồ sơ chờ xác minh', { count: submissions })}
      </button>}
      {evaluations.length > 0 && <section aria-label={t('Yêu cầu đánh giá phỏng vấn')}>
        <h3>{t('Yêu cầu đánh giá phỏng vấn')}</h3>
        <ul>
          {evaluations.map(interview => <li key={interview.id}>
            <div>
              <strong>{interview.candidate_name}</strong>
              <p>{interview.job_title} · {date(interview.starts_at, true)}</p>
            </div>
            <EvaluationButton interview={interview} user={user} onOpen={onEvaluation}/>
          </li>)}
        </ul>
      </section>}
      {!requests && !submissions && !evaluations.length && <p>{t('Không có yêu cầu mới cần xử lý.')}</p>}
    </div>
  </Modal>;
}
