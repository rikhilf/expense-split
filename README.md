# Expense Split App

A React Native + Expo app for splitting expenses with friends and groups, built with TypeScript and Supabase.

## Features

### Authentication
- Email/password authentication
- Google OAuth integration
- Apple OAuth integration
- Session management

### Groups
- Create and manage expense groups
- View all groups you belong to
- Group details with member information

### Expenses
- Add expenses to groups
- Equal split functionality
- Custom shares (coming soon)
- Expense details and breakdown
- Edit and delete expenses (coming soon)

### Database Schema

The app uses Supabase with the following tables:

1. **groups** - Store group information
2. **memberships** - Track user membership in groups
3. **expenses** - Store expense records
4. **expense_splits** - Track how expenses are split between users
5. **settlements** - Track payments between users

## Project Structure

```
src/
├── components/          # Reusable UI components
├── hooks/              # Custom React hooks
│   ├── useSupabase.ts
│   ├── useGroups.ts
│   ├── useExpenses.ts
│   └── useAddExpense.ts
├── lib/                # External library configurations
│   └── supabase.ts     # Supabase client setup
├── navigation/         # Navigation components
│   ├── AuthNavigator.tsx
│   └── AppNavigator.tsx
├── screens/           # Screen components
│   ├── SignInScreen.tsx
│   ├── SignUpScreen.tsx
│   ├── GroupListScreen.tsx
│   ├── CreateGroupScreen.tsx
│   ├── GroupDetailScreen.tsx
│   ├── AddExpenseScreen.tsx
│   └── ExpenseDetailScreen.tsx
└── types/             # TypeScript type definitions
    └── db.ts          # Database types
```

## Setup Instructions

### Prerequisites
- Node.js (v16 or higher)
- Expo CLI
- Supabase account

### Installation

1. **Install dependencies**
   ```bash
   cd expense-split
   npm install
   ```

2. **Configure environment variables**
   Create a `.env` file in the root directory:
   ```
   SUPABASE_URL=your_supabase_url
   SUPABASE_ANON_KEY=your_supabase_anon_key
   ```

3. **Start the development server**
   ```bash
   npm start
   ```

### Supabase Setup

1. Create a new Supabase project
2. Set up the database tables with the provided schema
3. Configure Row Level Security (RLS) policies
4. Set up authentication providers (Google, Apple)
5. Update the environment variables with your Supabase credentials

## Database Schema

### Groups Table
```sql
CREATE TABLE groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now())
);
```

### Memberships Table
```sql
CREATE TABLE memberships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  group_id UUID REFERENCES groups(id) ON DELETE CASCADE,
  role TEXT CHECK (role IN ('admin', 'member')) DEFAULT 'member',
  joined_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now())
);
```

### Expenses Table
```sql
CREATE TABLE expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID REFERENCES groups(id) ON DELETE CASCADE,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  description TEXT NOT NULL,
  amount NUMERIC(10,2) NOT NULL,
  date DATE NOT NULL,
  type TEXT DEFAULT 'manual',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now())
);
```

### Expense Splits Table
```sql
CREATE TABLE expense_splits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  expense_id UUID REFERENCES expenses(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  share NUMERIC(5,4) NOT NULL,
  amount NUMERIC(10,2) NOT NULL
);
```

### Settlements Table
```sql
CREATE TABLE settlements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID REFERENCES groups(id) ON DELETE CASCADE,
  paid_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  paid_to UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  amount NUMERIC(10,2) NOT NULL,
  settled_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now()),
  note TEXT
);
```

## RLS Policies

The app uses Row Level Security to ensure users only see data they're authorized to access. Example policies:

```sql
-- Enable RLS on all tables
ALTER TABLE groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE expense_splits ENABLE ROW LEVEL SECURITY;
ALTER TABLE settlements ENABLE ROW LEVEL SECURITY;

-- Example policy for groups
CREATE POLICY "Users can view groups they belong to" ON groups
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM memberships 
      WHERE memberships.group_id = groups.id 
      AND memberships.user_id = auth.uid()
    )
  );
```

## Development Notes

### TODO Items
- [ ] Implement custom expense shares
- [ ] Add expense editing functionality
- [ ] Add expense deletion functionality
- [ ] Implement member management
- [ ] Add settlement tracking
- [ ] Implement invoice parsing (future feature)
- [ ] Add push notifications
- [ ] Add offline support

### Known Issues
- Some Supabase queries may need optimization for complex joins
- OAuth redirect URLs need to be configured in Supabase
- Custom expense shares feature needs backend implementation

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## License

This project is licensed under the MIT License. 