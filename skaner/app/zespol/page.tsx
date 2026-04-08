'use client';

import { useState, useEffect } from 'react';
import Navigation from '@/components/Navigation';

interface Member {
  email: string;
  firstName: string;
  role: 'owner' | 'member';
  approved: boolean;
  createdAt: string;
}

interface OrgInfo {
  nip: string;
  name: string;
  ownerEmail: string;
  scansThisMonth: number;
  memberCount: number;
}

export default function TeamPage() {
  const [org, setOrg] = useState<OrgInfo | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [isOwner, setIsOwner] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [noOrg, setNoOrg] = useState(false);

  // Invite form
  const [showInvite, setShowInvite] = useState(false);
  const [invEmail, setInvEmail] = useState('');
  const [invName, setInvName] = useState('');
  const [invPassword, setInvPassword] = useState('');
  const [inviting, setInviting] = useState(false);
  const [inviteMsg, setInviteMsg] = useState('');

  const inputStyles =
    'w-full px-4 py-3 bg-white border border-beige-dark/30 rounded-card text-[15px] text-text-primary placeholder:text-text-gray/50 focus:outline-none focus:border-dk-teal/40 focus:ring-1 focus:ring-dk-teal/20 transition-colors';

  const fetchTeam = async () => {
    try {
      const res = await fetch('/api/team');
      if (res.status === 401) {
        window.location.href = '/';
        return;
      }
      if (res.status === 400) {
        setNoOrg(true);
        setLoading(false);
        return;
      }
      const data = await res.json();
      setOrg(data.org);
      setMembers(data.members);
      setIsOwner(data.isOwner);
    } catch {
      setError('Błąd połączenia z serwerem');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchTeam(); }, []);

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    setInviting(true);
    setInviteMsg('');
    try {
      const res = await fetch('/api/team', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: invEmail, firstName: invName, password: invPassword }),
      });
      const data = await res.json();
      if (!res.ok) {
        setInviteMsg(data.error || 'Błąd dodawania');
        return;
      }
      setInviteMsg(data.message || 'Dodano!');
      setInvEmail('');
      setInvName('');
      setInvPassword('');
      setShowInvite(false);
      fetchTeam();
    } catch {
      setInviteMsg('Błąd połączenia');
    } finally {
      setInviting(false);
    }
  };

  const handleRemove = async (email: string) => {
    if (!confirm(`Czy na pewno chcesz usunąć ${email} z zespołu?`)) return;
    try {
      const res = await fetch('/api/team', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      if (res.ok) fetchTeam();
    } catch {
      // silently fail
    }
  };

  if (loading) {
    return (
      <>
        <Navigation />
        <main className="min-h-screen py-24 px-6">
          <div className="flex justify-center">
            <span className="inline-block w-6 h-6 border-2 border-dk-teal border-t-transparent rounded-full animate-spin" />
          </div>
        </main>
      </>
    );
  }

  if (noOrg) {
    return (
      <>
        <Navigation />
        <main className="min-h-screen py-24 px-6">
          <div className="max-w-md mx-auto text-center">
            <h2 className="font-heading text-2xl text-text-primary mb-4">Brak organizacji</h2>
            <p className="text-text-muted text-sm mb-6">
              Twoje konto nie jest przypisane do żadnej organizacji.
            </p>
            <a href="/" className="text-sm text-dk-teal hover:text-dk-teal/80 transition-colors">
              Wróć do skanera
            </a>
          </div>
        </main>
      </>
    );
  }

  return (
    <>
      <Navigation />
      <main className="min-h-screen py-16 px-6">
        <div className="max-w-2xl mx-auto">
          {/* Org header */}
          {org && (
            <div className="bg-white rounded-card p-6 mb-6">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h1 className="font-heading text-2xl text-text-primary">{org.name}</h1>
                  <p className="text-sm text-text-gray">NIP: {org.nip}</p>
                </div>
                <div className="text-right">
                  <span className="text-xs px-2.5 py-0.5 bg-dk-teal/10 text-dk-teal rounded-pill font-medium">
                    Pozostało skanów: {3 - org.scansThisMonth} z 3
                  </span>
                  <p className="text-xs text-text-gray mt-1">{org.memberCount} {org.memberCount === 1 ? 'członek' : 'członków'}</p>
                </div>
              </div>
              <a href="/" className="text-sm text-dk-teal hover:text-dk-teal/80 transition-colors">
                &larr; Wróć do skanera
              </a>
            </div>
          )}

          {error && (
            <div className="bg-red-50 border border-red-200/50 rounded-xl px-4 py-3 mb-6">
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}

          {/* Members list */}
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-heading text-xl text-text-primary">Członkowie zespołu</h2>
            {isOwner && (
              <button
                onClick={() => setShowInvite(!showInvite)}
                className="text-sm px-4 py-2 bg-dk-orange text-white rounded-pill font-medium hover:bg-dk-orange-hover transition-all"
              >
                {showInvite ? 'Anuluj' : 'Dodaj członka'}
              </button>
            )}
          </div>

          {/* Invite form */}
          {showInvite && (
            <div className="bg-white rounded-card p-6 mb-4">
              <h3 className="font-heading text-lg text-text-primary mb-4">Dodaj nowego członka</h3>
              <form onSubmit={handleInvite} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-text-secondary mb-1">Email</label>
                  <input
                    type="email"
                    value={invEmail}
                    onChange={(e) => setInvEmail(e.target.value)}
                    className={inputStyles}
                    placeholder="jan@firma.pl"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-text-secondary mb-1">Imię</label>
                  <input
                    type="text"
                    value={invName}
                    onChange={(e) => setInvName(e.target.value)}
                    className={inputStyles}
                    placeholder="Jan"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-text-secondary mb-1">Hasło startowe</label>
                  <input
                    type="text"
                    value={invPassword}
                    onChange={(e) => setInvPassword(e.target.value)}
                    className={inputStyles}
                    placeholder="Min. 8 znaków"
                    required
                  />
                </div>
                <button
                  type="submit"
                  disabled={inviting}
                  className="w-full py-3 bg-dk-teal text-white rounded-card font-medium text-[15px] hover:bg-dk-teal-hover transition-all disabled:opacity-50"
                >
                  {inviting ? 'Dodaję...' : 'Dodaj do zespołu'}
                </button>
              </form>
              {inviteMsg && (
                <p className="text-sm mt-3 text-text-muted">{inviteMsg}</p>
              )}
            </div>
          )}

          <div className="space-y-2">
            {members.map((member) => (
              <div key={member.email} className="bg-white rounded-card p-4 flex items-center gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-text-primary">{member.firstName}</span>
                    {member.role === 'owner' && (
                      <span className="text-[10px] px-2 py-0.5 bg-dk-teal/10 text-dk-teal rounded-pill uppercase font-medium">
                        Właściciel
                      </span>
                    )}
                    <span className={`text-[10px] px-2 py-0.5 rounded-pill uppercase font-medium ${
                      member.approved
                        ? 'bg-emerald-50 text-emerald-700'
                        : 'bg-amber-50 text-amber-700'
                    }`}>
                      {member.approved ? 'Aktywne' : 'Czeka'}
                    </span>
                  </div>
                  <p className="text-sm text-text-muted truncate">{member.email}</p>
                </div>
                {isOwner && member.role !== 'owner' && (
                  <button
                    onClick={() => handleRemove(member.email)}
                    className="shrink-0 text-xs px-3 py-1.5 bg-red-50 text-red-700 rounded-pill hover:bg-red-100 transition-colors"
                  >
                    Usuń
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      </main>
    </>
  );
}
