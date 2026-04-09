const common = {
    appName: "STEMM Lab",
    actions: {
        back: "Kembali",
        cancel: "Batal",
        close: "Tutup",
        continue: "Lanjut",
        done: "Selesai",
        logout: "Keluar",
        ok: "OK",
        retry: "Coba lagi",
        save: "Simpan",
        start: "Mulai",
        startActivity: "Mulai Aktivitas",
        submit: "Kirim",
    },
    states: {
        loading: "Memuat...",
        loadingActivities: "Memuat aktivitas...",
        loadingActivity: "Memuat aktivitas...",
        loadingProfile: "Memuat profil...",
        starting: "Memulai...",
        saving: "Menyimpan...",
    },
    feedback: {
        error: "Kesalahan",
        notImplemented: "Belum diimplementasikan",
        signInRequired: "Harus masuk akun",
        updateFailed: "Pembaruan gagal",
        saved: "Tersimpan",
    },
    empty: {
        noActivitiesYet: "Belum ada aktivitas",
    },
} as const;

export default common;