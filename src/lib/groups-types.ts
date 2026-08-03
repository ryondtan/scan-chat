export type GroupProfile = {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
};

export type StudyGroup = {
  id: string;
  name: string;
  description: string | null;
  subject: string | null;
  join_code: string;
  created_by: string;
  conversation_id: string | null;
  created_at: string;
};

export type GroupSummary = StudyGroup & {
  role: string;
  member_count: number;
};

export type GroupMember = {
  user_id: string;
  role: string;
  joined_at: string;
  profile: GroupProfile | null;
};

export type GroupNote = {
  id: string;
  group_id: string;
  author_id: string;
  title: string;
  content: string;
  created_at: string;
  updated_at: string;
};

export type GroupFile = {
  id: string;
  group_id: string;
  uploader_id: string;
  name: string;
  path: string;
  size_bytes: number | null;
  mime_type: string | null;
  created_at: string;
};

export type GroupTask = {
  id: string;
  group_id: string;
  created_by: string;
  assigned_to: string | null;
  title: string;
  description: string | null;
  due_date: string | null;
  completed: boolean;
  completed_at: string | null;
};

export type GroupEvent = {
  id: string;
  group_id: string;
  created_by: string;
  title: string;
  description: string | null;
  location: string | null;
  starts_at: string;
  ends_at: string | null;
};

export type GroupCard = { id: string; deck_id: string; front: string; back: string };

export type GroupDeck = {
  id: string;
  group_id: string;
  created_by: string;
  title: string;
  subject: string | null;
  created_at: string;
  cards?: GroupCard[];
};

export type QuizQuestion = {
  question: string;
  options: string[];
  answer: number;
};

export type GroupQuiz = {
  id: string;
  group_id: string;
  created_by: string;
  title: string;
  topic: string | null;
  questions: QuizQuestion[];
  created_at: string;
};

export type GroupAiMessage = {
  id: string;
  user_id: string | null;
  role: string;
  content: string;
  created_at: string;
};

export type MemberProgress = {
  user_id: string;
  display_name: string;
  avatar_url: string | null;
  tasks_assigned: number;
  tasks_done: number;
  quizzes_taken: number;
  avg_score: number | null;
};
