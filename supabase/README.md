# Supabase Setup Instructions

This directory contains the necessary migration files for setting up the Supabase database schema.

## Environment Setup

1. Copy the `.env.example` file to `.env` and fill in your Supabase credentials:

   ```env
   REACT_APP_SUPABASE_URL=https://your-project.supabase.co
   REACT_APP_SUPABASE_ANON_KEY=your-anon-key
   ```

## Pushing Migrations

You don't need to install the Supabase CLI globally. Instead, you can use npx to run the commands.

To push your migration (which creates the `squirts` table), run:

```bash
npx supabase db push
```

This command will apply all migration files (including `001_create_squirts_table.sql`) to your Supabase project.

## Additional Commands

For more information about available commands, run:

```bash
npx supabase --help
```
