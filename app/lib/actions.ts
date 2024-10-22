'use server';

import { signIn } from '@/auth';
import { AuthError } from 'next-auth';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';

import { getPgClient } from '@/app/lib/data';

export type State = {
  errors?: {
    customerId?: string[];
    amount?: string[];
    status?: string[];
  };
  message?: string | null;
};

const FormSchema = z.object({
  id: z.string(),
  customerId: z.string({
    invalid_type_error: 'Please select a customer.',
  }),
  amount: z.coerce.number().gt(0, { message: 'Please enter an amount greater than $ 0.00.' }),
  status: z.enum(['pending', 'paid'], { invalid_type_error: 'Please select an invoice status.' }),
  date: z.string(),
});

const CreateInvoice = FormSchema.omit({ id: true, date: true });

export async function createInvoice(_prevState: State, formData: FormData) {
  const validatedFields = CreateInvoice.safeParse({
    customerId: formData.get('customerId'),
    amount: formData.get('amount'),
    status: formData.get('status'),
  });

  if (!validatedFields.success) {
    return {
      errors: validatedFields.error.flatten().fieldErrors,
      message: 'Missing Fields. Failed to Create Invoice.',
    };
  }

  const { customerId, amount, status } = validatedFields.data;
  const amountInCents = amount * 100;
  const date = new Date().toISOString().split('T')[0];

  try {
    const sql = await getPgClient();
    const values = [customerId, amountInCents, status, date];
    await sql?.query(
      `INSERT INTO invoices (customer_id, amount, status, date)
      VALUES ($1, $2, $3, $4)
    `, values);

    revalidatePath('/dashboard/invoices');
  } catch(err) {
    return {
      message: 'Database Error: Failed to create Invoice. Message: ' + (err as Error).message,
    };
  }

  redirect('/dashboard/invoices');
}

const UpdateInvoice = FormSchema.omit({ id: true, date: true });

export async function updateInvoice(id: string, _prevState: State, formData: FormData) {
  const validatedFields = UpdateInvoice.safeParse({
    customerId: formData.get('customerId'),
    amount: formData.get('amount'),
    status: formData.get('status'),
  });

  if (!validatedFields.success) {
    return {
      errors: validatedFields.error.flatten().fieldErrors,
      message: 'Missing Fields. Failed to Update Invoice.',
    };
  }

  const { customerId, amount, status } = validatedFields.data;
  const amountInCents = amount * 100;

  try {
    const sql = await getPgClient();
    const values = [customerId, amountInCents, status, id];

    await sql.query(`
      UPDATE invoices
      SET customer_id = $1, amount = $2, status = $3
      WHERE id = $4
    `, values);

    revalidatePath('/dashboard/invoices');
  } catch (err) {
    return {
      message: 'Database Error: Failed to update Invoice. Message: ' + (err as Error).message,
    };
  }

  redirect('/dashboard/invoices');
}

export async function deleteInvoice(id: string) {
  try {
    const sql = await getPgClient();
    await sql.query(`DELETE FROM invoices WHERE id = $1`, [id]);

    revalidatePath('/dashboard/invoices');
    return { message: 'Deleted Invoice.' };
  } catch (err) {
    return {
      message: 'Database Error: Failed to delete Invoice. Message: ' + (err as Error).message,
    };
  }
}

export async function authenticate(
  _prevState: string | undefined,
  formData: FormData,
) {
  try {
    await signIn('credentials', formData);
  } catch(err) {
    if (err instanceof AuthError) {
      switch(err.type) {
        case 'CredentialsSignin':
          return 'Invalid credentials.';
        default: 
          return 'Something went wrong.';
      }
    }
    throw err;
  }
}
