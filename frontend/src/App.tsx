import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { Toaster } from '@/components/ui/sonner'
import { Providers } from '@/providers'
import { AppShell } from '@/components/layout/AppShell'
import { Home } from '@/routes/Home'
import { CreateOrg } from '@/routes/CreateOrg'
import { Employer } from '@/routes/Employer'
import { Employee } from '@/routes/Employee'
import { Verify } from '@/routes/Verify'

export default function App() {
  return (
    <Providers>
      <BrowserRouter>
        <AppShell>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/setup" element={<CreateOrg />} />
            <Route path="/employer" element={<Employer />} />
            <Route path="/employee" element={<Employee />} />
            <Route path="/verify" element={<Verify />} />
          </Routes>
        </AppShell>
        <Toaster position="bottom-right" toastOptions={{ classNames: { toast: 'font-sans' } }} />
      </BrowserRouter>
    </Providers>
  )
}
