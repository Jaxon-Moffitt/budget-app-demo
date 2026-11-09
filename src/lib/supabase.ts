// The demo has no backend: this stand-in answers the app's Supabase calls
// from made-up data kept in memory (see src/demo). A reload starts over.
import { createDemoClient } from '@/demo/db';

export const supabase = createDemoClient();
