import { useEffect, useRef, useState } from "react";
import { api, useAuth } from "./api.jsx";
import { Avatar, Button, Card, ErrorBox, Field, Head, Input, OkBox, Pill } from "./ui.jsx";

// Crops the chosen image to a centred square and shrinks it to 256 px, so the stored photo stays small (about 20 KB).
function toAvatar(file, size = 256) {
  return new Promise((resolve, reject) => {
    if (!/^image\/(jpeg|png|webp)$/.test(file.type)) return reject(new Error("Please choose a JPG, PNG or WebP image."));
    if (file.size > 8 * 1024 * 1024) return reject(new Error("That image is too large. Maximum size is 8 MB."));
    const url = URL.createObjectURL(file), img = new Image();
    img.onload = () => {
      const side = Math.min(img.width, img.height), c = document.createElement("canvas");
      c.width = c.height = size;
      const ctx = c.getContext("2d");
      ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, size, size);
      ctx.drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, size, size);
      URL.revokeObjectURL(url);
      resolve(c.toDataURL("image/jpeg", 0.85));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Could not read that image.")); };
    img.src = url;
  });
}

const Msg = ({ m }) => (m ? (m.ok ? <OkBox>{m.text}</OkBox> : <ErrorBox>{m.text}</ErrorBox>) : null);

export default function Profile() {
  const { user, updateUser, logout } = useAuth();
  const fileRef = useRef(null);
  const [photoMsg, setPhotoMsg] = useState(null), [nameMsg, setNameMsg] = useState(null), [pwMsg, setPwMsg] = useState(null);
  const [name, setName] = useState(user.name), [busy, setBusy] = useState(false);
  const [pw, setPw] = useState({ currentPassword: "", newPassword: "", confirm: "" });
  const [menu, setMenu] = useState(false);

  // Closes the pen menu when you click anywhere else.
  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(false);
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, [menu]);

  // Shows a message, then removes it by itself (success after 3 s, errors after 5 s).
  const flash = (set, m) => { set(m); setTimeout(() => set((cur) => (cur === m ? null : cur)), m.ok ? 3000 : 5000); };

  const savePhoto = async (avatar) => {
    setBusy(true);
    try { updateUser(await api("/auth/me", { method: "PATCH", body: { avatar } })); flash(setPhotoMsg, { ok: true, text: avatar ? "Photo updated." : "Photo removed." }); }
    catch (e) { flash(setPhotoMsg, { text: e.message }); }
    setBusy(false);
  };
  const pick = async (e) => {
    const file = e.target.files[0]; e.target.value = "";
    if (!file) return;
    try { await savePhoto(await toAvatar(file)); } catch (x) { flash(setPhotoMsg, { text: x.message }); }
  };
  const saveName = async (e) => {
    e.preventDefault();
    try { updateUser(await api("/auth/me", { method: "PATCH", body: { name } })); flash(setNameMsg, { ok: true, text: "Name updated." }); }
    catch (x) { flash(setNameMsg, { text: x.message }); }
  };
  const savePw = async (e) => {
    e.preventDefault();
    if (pw.newPassword !== pw.confirm) return flash(setPwMsg, { text: "The new passwords do not match." });
    try {
      await api("/auth/password", { method: "POST", body: { currentPassword: pw.currentPassword, newPassword: pw.newPassword } });
      setPw({ currentPassword: "", newPassword: "", confirm: "" }); flash(setPwMsg, { ok: true, text: "Password changed." });
    } catch (x) { flash(setPwMsg, { text: x.message }); }
  };

  return (
    <>
      <Head title="My profile" sub="Manage your photo, name and password." />
      <div className="grid items-start gap-5 lg:grid-cols-[320px_1fr]">
        <Card className="flex flex-col items-center gap-3 text-center">
          <div className="relative">
            <Avatar user={user} size={120} />
            {user.avatar && (
              <>
                <button type="button" aria-label="Edit photo" aria-haspopup="menu" aria-expanded={menu} disabled={busy}
                  onClick={(e) => { e.stopPropagation(); setMenu(!menu); }}
                  className="absolute bottom-1 right-1 grid h-9 w-9 place-items-center rounded-full border-2 border-white bg-brand text-white shadow hover:bg-brand-dark disabled:opacity-60">
                  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 20h9M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4 12.5-12.5z" /></svg>
                </button>
                {menu && (
                  <div role="menu" className="absolute left-1/2 top-full z-10 mt-2 w-44 -translate-x-1/2 overflow-hidden rounded-md border border-line bg-white py-1 text-left text-sm shadow-lg">
                    <button type="button" role="menuitem" className="block w-full px-3 py-2 text-left hover:bg-slate-50" onClick={() => fileRef.current.click()}>Change photo</button>
                    <button type="button" role="menuitem" className="block w-full px-3 py-2 text-left text-coral hover:bg-red-50" onClick={() => savePhoto("")}>Remove photo</button>
                  </div>
                )}
              </>
            )}
          </div>
          <div>
            <p className="text-lg font-semibold">{user.name}</p>
            <p className="break-all text-sm text-muted">{user.email}</p>
            <div className="mt-2"><Pill tone={user.role === "admin" ? "warn" : "default"}>{user.role === "admin" ? "Admin" : "Clinician"}</Pill></div>
          </div>
          <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={pick} aria-label="Choose a profile photo" />
          {!user.avatar && <Button variant="primary" disabled={busy} onClick={() => fileRef.current.click()}>Upload photo</Button>}
          <p className="text-xs text-muted">JPG, PNG or WebP. The image is cropped to a square.</p>
          <div className="w-full"><Msg m={photoMsg} /></div>
        </Card>

        <div className="grid gap-5">
          <Card>
            <h2 className="mb-3 text-[1.05rem] font-semibold">Account details</h2>
            <form onSubmit={saveName} className="grid max-w-xl gap-3">
              <Field label="Full name"><Input value={name} onChange={(e) => setName(e.target.value)} minLength={2} maxLength={60} required /></Field>
              <Field label="Email"><Input value={user.email} disabled /></Field>
              <div><Button type="submit" variant="primary" disabled={name.trim() === user.name}>Save changes</Button></div>
              <Msg m={nameMsg} />
            </form>
          </Card>

          <Card>
            <h2 className="mb-3 text-[1.05rem] font-semibold">Change password</h2>
            <form onSubmit={savePw} className="grid max-w-xl gap-3">
              <Field label="Current password"><Input type="password" autoComplete="current-password" value={pw.currentPassword} onChange={(e) => setPw({ ...pw, currentPassword: e.target.value })} required /></Field>
              <Field label="New password (8+ characters)"><Input type="password" autoComplete="new-password" minLength={8} value={pw.newPassword} onChange={(e) => setPw({ ...pw, newPassword: e.target.value })} required /></Field>
              <Field label="Confirm new password"><Input type="password" autoComplete="new-password" minLength={8} value={pw.confirm} onChange={(e) => setPw({ ...pw, confirm: e.target.value })} required /></Field>
              <div><Button type="submit" variant="primary">Update password</Button></div>
              <Msg m={pwMsg} />
            </form>
          </Card>

          <Card className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-[1.05rem] font-semibold">Sign out</h2>
              <p className="text-sm text-muted">End your session on this device.</p>
            </div>
            <Button variant="danger" onClick={logout}>Sign out</Button>
          </Card>
        </div>
      </div>
    </>
  );
}