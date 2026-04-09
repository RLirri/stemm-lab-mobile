const activities = {
    listTitle: "Aktivitas",
    listLoadFailed: "Gagal memuat aktivitas",
    couldntLoad: "Tidak dapat dimuat",
    emptyHint: "Minta admin untuk mengisi Activity Catalog atau membuat dokumen aktivitas di Firestore.",

    detail: {
        notFound: "Aktivitas tidak ditemukan",
        notFoundMessage: "Aktivitas ini tidak ada atau Anda tidak memiliki izin untuk melihatnya.",
        overview: "Ikhtisar",
        instructions: "Instruksi",
        equipment: "Peralatan",
        startRoute: "Rute mulai",
        flowMissing:
            "Rute alur belum dikonfigurasi untuk aktivitas ini (startRoute belum ada di activityCatalog).",
        startFailed: "Gagal memulai",
        unknownRoute: "Rute tidak dikenal",
        flowMisconfigured: "Alur salah konfigurasi",
        continueActivity: "Lanjutkan Aktivitas",
    },

    common: {
        sessionExpiredTitle: "Sesi berakhir",
        sessionExpiredMessage: "Sesi draf Anda direset. Silakan mulai lagi.",
        runMissingTitle: "Sesi tidak ditemukan",
        runMissingMessage: "Sesi ini tidak dapat dipulihkan.",
        loadingDraft: "Memuat draf...",
        loadingSession: "Memuat sesi...",
        checkFieldsTitle: "Periksa isian",
        saveSuccessTitle: "Tersimpan",
        saveSuccessMessage: "Progres Anda telah disimpan.",
        removeTitle: "Hapus",
        optional: "Opsional",
        required: "Wajib",
        yes: "Ya",
        no: "Tidak",
        on: "Aktif",
        off: "Nonaktif",
        enabled: "Diaktifkan",
        disabled: "Dinonaktifkan",
        baseline: "Dasar",
        prototype: "Prototipe",
        participant: "Peserta",
        participants: "Peserta",
        trial: "Percobaan",
        trials: "Percobaan",
        notes: "Catatan",
        hint: "Petunjuk",
        warning: "Peringatan",
        recommended: "Disarankan",
        status: "Status",
        noVideoYet: "Belum ada video",
        videoAttached: "Video terpasang ✅",
        preparingVideo: "Menyiapkan video...",
        gpsDisabledTitle: "GPS dinonaktifkan",
        gpsDisabledMessage:
            "Anda tetap bisa melanjutkan, tetapi peta atau syarat pengumpulan mungkin terpengaruh.",
        evidenceVideoTitle: "Bukti — Video",
        evidenceVideoHelp:
            "Lampirkan bukti video jika diwajibkan. Perekaman paling baik di perangkat nyata.",
        recordVideo: "Rekam Video",
        pickFromLibrary: "Pilih dari Galeri",
        removeVideo: "Hapus Video",
        videoAttachedTitle: "Video terpasang ✅",
        videoAttachedMessage: "Video ini akan diunggah saat Anda mengirim.",
        videoErrorTitle: "Kesalahan video",
        videoErrorMessage: "Gagal melampirkan video.",
        ratingLabel: "Penilaian (1–5)",
        ratingPlaceholder: "mis. 5",
        sessionLabel: "Label sesi",
        sessionLabelPlaceholder: "mis. Minggu 4 — Kelas A",
        sessionLabelTooLong:
            "Label sesi terlalu panjang. Harap kurang dari 60 karakter.",
        gpsTitle: "GPS",
        gpsEnableLabel: "Aktifkan penandaan GPS",
        gpsEnableHelp: "Disarankan untuk peta, perbandingan, dan fitur pengumpulan.",
        reflectionTitle: "Refleksi",
        reflectionHelp:
            "Tulis penjelasan singkat berdasarkan hasil dan alasan ilmiah Anda.",
        submitTitle: "Refleksi & Kirim",
        resultsTitle: "Hasil",
        predictionTitle: "Prediksi",
        measurementsTitle: "Pengukuran",
        setupTitle: "Pengaturan Sesi",
        compareTitle: "Bandingkan",
        nextHintPrefix: "Berikutnya:",
    },

    a1: {
        meta: {
            title: "Tantangan Jatuh Parasut",
            shortDescription:
                "Rancang parasut untuk memperlambat benda jatuh menggunakan bahan sehari-hari.",
        },

        common: {
            baselineLabel: "Dasar (tanpa parasut)",
            prototypeLabel: "Prototipe {{index}}",
            attemptMissingTitle: "Percobaan tidak ditemukan",
            attemptMissingMessage: "Slot percobaan ini tidak ada.",
            compareFairlyHint:
                "Pertahankan tinggi dan muatan yang sama agar perbandingan adil.",
        },

        sessionSetup: {
            title: "Pengaturan Sesi",
            subtitle:
                "Atur sesi terlebih dahulu. Anda dapat memulai timer tantangan 20 menit kapan saja.",

            timedChallengeTitle: "Tantangan Berwaktu",
            timerNotStarted: "Belum dimulai",
            timerRunning: "Berjalan",
            timerEnded: "Berakhir",
            startChallenge: "Mulai Tantangan 20 Menit",

            requiredInputsTitle: "Input Wajib",
            dropHeightLabel: "Tinggi Jatuh (m)",
            dropHeightPlaceholder: "mis. 1.5",
            dropHeightHelp:
                "Boleh diukur nanti, tetapi harus diisi sebelum percobaan disimpan.",

            landingTargetZoneLabel: "Zona Target Pendaratan",
            landingTargetZoneHelp: "Aktifkan jika Anda ingin penilaian akurasi.",
            targetPresetLabel: "Preset target",
            targetPreset50cm: "Dalam lingkaran 50 cm",
            targetPreset1m: "Dalam lingkaran 1 m",

            environmentLabel: "Lingkungan",
            environmentIndoor: "Dalam ruangan",
            environmentOutdoor: "Luar ruangan",

            payloadTypeLabel: "Muatan (jenis mainan)",
            payloadTypePlaceholder: "mis. tentara mainan",

            payloadMassLabel: "Massa Muatan (g)",
            payloadMassHelp: "Jika tidak diketahui, perhitungan akan terbatas.",
            payloadMassPlaceholder: "mis. 20",
            unknownToggleLabel: "Tidak diketahui",

            safetyChecklistTitle: "Daftar Periksa Keamanan",
            safetyStableSurface: "Jatuhkan dari permukaan stabil",
            safetyKeepAreaClear: "Pastikan area tetap kosong",
            safetyDoNotThrow: "Jangan melempar benda",

            footerHint:
                "Berikutnya: rencana percobaan dasar → rekam video → pengukuran → hasil. Anda dapat menjalankan hingga 3 prototipe dalam timer.",

            validationDropHeight: "Masukkan Tinggi Jatuh (m). Nilainya harus > 0.",
            validationTargetPreset:
                "Zona target aktif. Pilih preset target (50 cm atau 1 m).",
            validationPayloadMass:
                "Masukkan Massa Muatan (g), atau aktifkan Tidak diketahui.",
            validationSafety:
                "Harap konfirmasi semua item daftar periksa keamanan.",
        },

        attemptPlan: {
            subtitle:
                "Rencanakan percobaan ini sebelum merekam. Jaga tinggi dan muatan tetap konsisten agar perbandingan adil.",

            confirmationNeededTitle: "Konfirmasi diperlukan",
            confirmationUnderstand: "Saya Mengerti",

            predictionTitle: "Prediksi",
            predictionHelp: "Perkirakan berapa detik hingga kontak pertama dengan tanah.",
            predictionLabel: "Prediksi (detik)",
            predictionPlaceholder: "mis. 1.2",

            prototypeDesignTitle: "Desain Prototipe",
            prototypeDesignHelp:
                "Pilih beberapa tag dan/atau tulis catatan. Ini akan membantu dashboard perbandingan Anda.",

            canopyMaterialLabel: "Bahan kanopi",
            canopyMaterialPaper: "kertas",
            canopyMaterialPlastic: "plastik",
            canopyMaterialFabric: "kain",
            canopyMaterialOther: "lainnya",

            canopyShapeLabel: "Bentuk kanopi",
            canopyShapeCircle: "lingkaran",
            canopyShapeSquare: "persegi",
            canopyShapeOther: "lainnya",

            stringsCountLabel: "Jumlah tali",
            stringsCountPlaceholder: "mis. 4",
            stringLengthLabel: "Panjang tali (cm)",
            stringLengthPlaceholder: "mis. 20",

            canopySizeLabel: "Diameter / sisi kanopi (cm)",
            canopySizePlaceholder: "mis. 25",

            notesLabel: "Catatan",
            notesPlaceholder: "Apa yang diubah dan mengapa?",

            sketchUploadTitle: "Unggah sketsa (foto)",
            sketchUploadHelp:
                "v1: pemilih kamera/galeri dapat ditambahkan nanti. Untuk sekarang, siapkan foto sketsa Anda.",

            attemptTypeTitle: "Jenis Percobaan",
            attemptTypeHelp:
                "Dasar selalu tanpa parasut. Setelah ini Anda akan membuat prototipe.",
            attemptTypeBaselinePill: "Dasar (tanpa parasut)",

            comparisonParametersTitle: "Parameter Perbandingan",
            dropHeightLabel: "Tinggi Jatuh (m)",
            dropHeightPlaceholder: "mis. 1.5",
            baselineReferenceHeight: "Tinggi acuan dasar: {{value}} m",

            payloadMassLabel: "Massa Muatan (g)",
            payloadMassHelp:
                "Jika tidak diketahui, gaya seret/g-force mungkin tidak dapat dihitung.",
            payloadMassPlaceholder: "mis. 20",
            massUnknown: "Tidak diketahui",
            massKnown: "Diketahui",
            baselineReferenceMass: "Massa acuan dasar: {{value}} g",

            recordDropVideo: "Rekam Video Jatuh",
            footerHint:
                "Berikutnya: perekaman video → pengukuran → hasil. Anda dapat menambah hingga 3 prototipe.",

            validationDropHeight:
                "Tinggi Jatuh (m) wajib diisi dan harus > 0.",
            validationPayloadMass:
                "Massa Muatan (g) wajib diisi kecuali Anda memilih Tidak diketahui.",
            validationPrototypeDesign:
                "Tambahkan setidaknya satu detail desain prototipe (bahan/bentuk/ukuran/catatan).",

            confirmHeightChanged:
                "Tinggi berubah; perbandingan mungkin tidak adil. Konfirmasi jika Anda tetap ingin melanjutkan.",
            confirmMassChanged:
                "Muatan berubah; perbandingan kecepatan/gaya ikut berubah. Konfirmasi jika Anda tetap ingin melanjutkan.",
        },

        measurements: {
            title: "Pengukuran",

            part1Title: "Bagian 1 — Waktu terbang",
            part1Help: "Waktu hingga kontak pertama dengan tanah (t_hit), dalam detik.",
            tHitLabel: "t_hit (detik)",
            tHitPlaceholder: "mis. 1.2",

            part2Title: "Bagian 2 — Waktu berhenti",
            part2Help:
                "Waktu dari kontak pertama hingga berhenti bergerak (t_stop), dalam detik (disarankan slow-motion).",
            tStopLabel: "t_stop (detik)",
            tStopPlaceholder: "mis. 0.05",

            part3Title: "Bagian 3 — Akurasi pendaratan (zona target)",
            part3Help:
                "Wajib karena zona target diaktifkan pada Pengaturan Sesi.",
            distanceLabel: "Jarak dari pusat (cm) (opsional)",
            distancePlaceholder: "mis. 35",

            landingAccuracyTitle: "Akurasi pendaratan",
            landingAccuracyHelp:
                "Zona target tidak diaktifkan. Anda dapat melewati penilaian akurasi untuk sesi ini.",

            bounceTitle: "Pantulan (opsional)",
            bounceHelp:
                "Jika terjadi pantulan, perkirakan dampak tambahan menggunakan waktu ke puncak setelah pantulan.",
            bounceOccurredLabel: "Terjadi pantulan?",
            tUpLabel: "t_up (detik) — waktu ke puncak setelah pantulan",
            tUpPlaceholder: "mis. 0.15",

            computeResults: "Hitung Hasil",
            footerHint:
                "Berikutnya: Hasil (nilai terhitung + interpretasi). Lalu simpan percobaan dan lanjutkan.",

            validationTHit:
                "Waktu hingga kontak pertama dengan tanah (t_hit) harus > 0.",
            validationTStop:
                "Waktu berhenti (t_stop) harus ≥ 0.",
            validationTargetZone:
                "Zona target aktif. Jawab apakah benda mendarat di zona target.",
            validationDistance:
                "Jarak dari pusat harus berupa angka tidak negatif.",
            validationBounce:
                "Pantulan aktif. Masukkan waktu ke puncak setelah pantulan (t_up) > 0.",
        },

        results: {
            title: "Hasil",
            summaryTitle: "Ringkasan",
            flightTime: "Waktu terbang",
            stopTime: "Waktu berhenti",
            landingAccuracy: "Akurasi pendaratan",
            bounceEstimate: "Perkiraan pantulan",
            interpretationTitle: "Interpretasi",
            continuePrototype: "Lanjut ke prototipe berikutnya",
            compareAttempts: "Bandingkan Percobaan",
            saveAndContinue: "Simpan dan Lanjutkan",
        },

        comparison: {
            title: "Bandingkan Percobaan",
            bestAttempt: "Percobaan terbaik",
            slowestDescent: "Turun paling lambat",
            mostStable: "Paling stabil",
            mostAccurate: "Paling akurat",
            summaryTitle: "Ringkasan Perbandingan",
            continueReflection: "Lanjut ke Refleksi",
        },

        reflection: {
            title: "Refleksi & Kirim",
            wereYouRightLabel: "Apakah prediksi Anda benar?",
            surprisesLabel: "Ada kejutan?",
            improveNextLabel: "Apa yang akan Anda perbaiki berikutnya?",
            scientificReasoningLabel:
                "Jelaskan dengan drag, massa, dan kestabilan.",
            submitButton: "Kirim Aktivitas",
        },
    },

    a2: {
        meta: {
            title: "Pemburu Polusi Suara",
            shortDescription:
                "Ukur dan bandingkan tingkat suara kelas (dB), catat lokasi, dan petakan area bising serta tenang.",
        },

        fallbackTitle: "Pemburu Polusi Suara",
        fallbackShortDescription:
            "Ukur dan bandingkan tingkat suara kelas (dB), catat lokasi, dan petakan area bising serta tenang.",
        fallbackOverview:
            "Siswa mengukur kebisingan dari berbagai tindakan (menjatuhkan benda, berbicara, berjalan, menghentak), mencatat tingkat suara dengan GPS, lalu memetakan area bising dan tenang. Mereka memprediksi tindakan paling bising dan merefleksikan apakah pelindung telinga diperlukan.",
        equipmentFallback1: "Ponsel dengan aplikasi STEMM Lab",
        equipmentFallback2: "Benda sehari-hari (pulpen/buku)",
        hearingRiskTitle: "Risiko Kerusakan Pendengaran (dB)",
        hearingRiskHelp:
            "Gunakan tabel ini untuk menentukan kategori risiko pada setiap pengukuran. Lalu jawab: “Apakah kita perlu memakai earmuff di kelas?”",
        submissionPolicy:
            "Kebijakan pengumpulan: minimal 3 pengukuran valid + 1 bukti video sesi.",
        promptsTitle: "Panduan Tugas Tulis",
        prompt1: "Prediksi tindakan mana yang menghasilkan suara paling keras.",
        prompt2: "Catat hasil (dB) untuk minimal 3 tindakan.",
        prompt3: "Apakah prediksi Anda benar? Mengapa?",
        prompt4: "Ada kejutan? Jelaskan dengan permukaan/material/energi.",
        prompt5: "Apakah kita perlu memakai earmuff di kelas? Gunakan tabel risiko sebagai bukti.",

        sessionSetup: {
            subtitle:
                "Atur label sesi dan pilih apakah GPS diaktifkan. GPS membantu Anda memetakan area bising dan tenang.",
            sessionLabelTitle: "Label Sesi",
            sessionLabelHelp:
                "Opsional tetapi disarankan (mis. Kelas A – baris depan, sudut perpustakaan, lab minggu 3).",
            label: "Label",
            labelPlaceholder: "mis. Minggu 3 — Ruang 210",
            labelTip:
                "Tip: gunakan label untuk membandingkan lokasi atau waktu yang berbeda.",

            gpsTitle: "GPS",
            gpsHelp:
                "Jika diaktifkan, setiap pengukuran dapat menyimpan koordinat dan tampil di peta. Anda tetap bisa lanjut tanpa GPS.",
            gpsEnableLabel: "Aktifkan penandaan GPS",
            gpsEnableHelp: "Disarankan untuk pemetaan area bising dan tenang.",
            gpsDisabledTitle: "GPS dinonaktifkan",
            gpsDisabledText:
                "Tampilan peta tetap berfungsi, tetapi pin akan menunjukkan Tidak ada lokasi dan penyaringan berdasarkan lokasi menjadi kurang bermakna.",

            footerHint:
                "Berikutnya: Prediksi → Siklus Pengukuran (min. 3 tindakan) → Peta → Hasil → Refleksi & Kirim.",

            validationLabelTooLong:
                "Label sesi terlalu panjang. Harap kurang dari 60 karakter.",
        },

        prediction: {
            title: "Prediksi",
            subtitle: "Prediksi tindakan paling bising sebelum mengukur.",
            predictedActionLabel: "Prediksi tindakan paling bising",
            predictedActionPlaceholder: "mis. Menjatuhkan buku",
            continueToMeasurement: "Lanjut ke Pengukuran",
        },

        measurement: {
            title: "Pengukuran",
            soundSourceLabel: "Sumber suara / tindakan",
            soundSourcePlaceholder: "mis. Berbicara, menghentak, menjatuhkan buku",
            locationLabel: "Catatan lokasi",
            locationPlaceholder: "mis. Baris depan, dekat pintu",
            decibelLabel: "Tingkat suara terukur (dB)",
            decibelPlaceholder: "mis. 72",
            addMeasurement: "Tambahkan Pengukuran",
            minimumMeasurements:
                "Setidaknya 3 pengukuran valid diperlukan sebelum melanjutkan.",
        },

        map: {
            title: "Peta",
            loudZones: "Area bising",
            quietZones: "Area tenang",
            noLocation: "Tidak ada lokasi",
            continueToResults: "Lanjut ke Hasil",
        },

        results: {
            title: "Hasil",
            averageDb: "Rata-rata tingkat suara",
            loudestAction: "Tindakan paling bising",
            quietestAction: "Tindakan paling tenang",
            hearingRisk: "Risiko pendengaran",
            interpretationTitle: "Interpretasi",
            continueToReflection: "Lanjut ke Refleksi",
        },

        reflection: {
            title: "Refleksi & Kirim",
            wereYouRightLabel: "Apakah prediksi Anda benar?",
            surprisesLabel: "Ada kejutan?",
            earmuffsLabel: "Apakah kita perlu memakai earmuff di kelas?",
            evidenceReasoningLabel: "Gunakan tabel risiko sebagai bukti.",
            submitButton: "Kirim Aktivitas",
        },
    },

    a3: {
        meta: {
            title: "Tantangan Kipas Tangan",
            shortDescription:
                "Bandingkan desain kipas dengan mengukur sudut tekuk pada jarak berbeda.",
        },

        overview: {
            title: "Ikhtisar",
            summary:
                "Bandingkan desain kipas dan bahan dengan mengukur sudut tekuk pada jarak berbeda.",
        },

        sessionSetup: {
            title: "Pengaturan Sesi",
            subtitle:
                "Pilih jumlah desain dan apakah mode lanjutan diaktifkan sebelum pengujian.",
            designCountLabel: "Jumlah desain kipas",
            designCountPlaceholder: "mis. 3",
            advancedModeLabel: "Aktifkan mode lanjutan",
            advancedModeHelp:
                "Mode lanjutan dapat mencakup interpretasi tambahan seperti kekakuan dan perkiraan gaya.",
        },

        prediction: {
            title: "Prediksi",
            predictedBestDesignLabel: "Prediksi desain terbaik",
            predictedBestDesignPlaceholder: "mis. Lipatan akordeon",
            continueToMeasurements: "Lanjut ke Pengukuran",
        },

        measurements: {
            title: "Pengukuran",
            designLabel: "Desain",
            materialLabel: "Bahan",
            distanceLabel: "Jarak (cm)",
            bendAngleLabel: "Sudut tekuk (°)",
            recordMeasurement: "Catat Pengukuran",
            materialPaper: "Kertas",
            materialCardboard: "Karton",
        },

        results: {
            title: "Hasil",
            averageAngle: "Rata-rata sudut",
            bestDesign: "Desain terbaik",
            strongestEffectDistance: "Pengaruh jarak terkuat",
            interpretationTitle: "Interpretasi",
        },

        comparison: {
            title: "Bandingkan Desain",
            compareMaterials: "Bandingkan Bahan",
            compareDistances: "Bandingkan Jarak",
            summaryTitle: "Ringkasan Perbandingan",
        },

        reflection: {
            title: "Refleksi & Kirim",
            wereYouRightLabel: "Apakah prediksi Anda benar?",
            surprisesLabel: "Ada kejutan?",
            materialEffectLabel: "Bagaimana kekakuan bahan memengaruhi tekukan?",
            distanceEffectLabel: "Bagaimana jarak memengaruhi tekukan?",
            submitButton: "Kirim Aktivitas",
        },
    },

    a4: {
        meta: {
            title: "Struktur Tahan Gempa",
            shortDescription:
                "Bangun dan bandingkan struktur peredam getaran dengan uji getaran 10 detik.",
        },

        overview: {
            title: "Ikhtisar",
            summary:
                "Rancang struktur yang mengurangi gerakan ponsel selama simulasi gempa.",
        },

        sessionSetup: {
            title: "Pengaturan Sesi",
            subtitle:
                "Atur konfigurasi pengujian sebelum menjalankan uji getaran 10 detik.",
            sessionLabelLabel: "Label sesi",
            gpsRequiredHelp:
                "GPS diperlukan untuk pengumpulan, meskipun Anda masih bisa menguji sebelum mengaktifkannya.",
            designCountLabel: "Jumlah desain",
            designCountPlaceholder: "mis. 3",
        },

        prediction: {
            title: "Prediksi",
            predictedBestDesignLabel: "Prediksi desain terbaik",
            predictedBestDesignPlaceholder: "mis. 10 lipatan + 4 pilar",
            continueToMeasurements: "Lanjut ke Pengukuran",
        },

        measurements: {
            title: "Pengukuran",
            startVibrationTest: "Mulai Uji Getaran 10 Detik",
            movementScoreLabel: "Skor magnitudo gerakan",
            attachEvidenceLabel: "Lampirkan bukti video sesi",
            designNotesLabel: "Catatan desain",
            designNotesPlaceholder: "mis. lipatan, lapisan, pilar, simetri",
        },

        results: {
            title: "Hasil",
            lowestMovementDesign: "Desain dengan gerakan paling rendah",
            averageMovement: "Rata-rata gerakan",
            interpretationTitle: "Interpretasi",
        },

        comparison: {
            title: "Bandingkan Desain",
            bestDesign: "Desain terbaik",
            designRanking: "Peringkat desain",
            continueToReflection: "Lanjut ke Refleksi",
        },

        reflection: {
            title: "Refleksi & Kirim",
            wereYouRightLabel: "Apakah prediksi Anda benar?",
            surprisesLabel: "Ada kejutan?",
            improveNextLabel: "Apa yang akan Anda perbaiki berikutnya?",
            submitButton: "Kirim Aktivitas",
        },
    },

    a5: {
        meta: {
            title: "Lab Performa Manusia – Kecepatan Peregangan & Keanggunan Gerak",
            shortDescription:
                "Ukur durasi gerak, kelancaran, dan jangkauan saat peregangan terpandu.",
        },

        overview: {
            title: "Ikhtisar",
            summary:
                "Bandingkan gerakan dasar dan gerakan dengan umpan balik menggunakan pengukuran gerak berbasis akselerometer.",
        },

        sessionSetup: {
            title: "Pengaturan Sesi",
            subtitle:
                "Atur peserta, durasi, dan mode umpan balik sebelum percobaan terpandu.",
            participantCountLabel: "Jumlah peserta",
            participantCountPlaceholder: "mis. 3",
            samplingHzLabel: "Laju sampling (Hz)",
            samplingHzPlaceholder: "mis. 50",
            durationLabel: "Durasi gerakan terpandu (detik)",
            durationPlaceholder: "mis. 20",
            feedbackEnabledLabel: "Aktifkan Mode Umpan Balik",
        },

        prediction: {
            title: "Prediksi",
            predictedVibrationLabel: "Prediksi tingkat getaran / gerakan",
            predictedVibrationPlaceholder: "mis. Rendah / Sedang / Tinggi",
            predictedHardestMovementLabel: "Prediksi gerakan tersulit",
            continueToTrials: "Lanjut ke Percobaan Terpandu",
        },

        guidedTrials: {
            title: "Percobaan Terpandu",
            baselineMode: "Mode Dasar",
            feedbackMode: "Mode Umpan Balik",
            startTrial: "Mulai Percobaan",
            completeTrial: "Selesaikan Percobaan",
            movement1: "Gerakan 1",
            movement2: "Gerakan 2",
            movement3: "Gerakan 3",
        },

        results: {
            title: "Hasil",
            smoothnessIndex: "Indeks kelancaran",
            rangeOfMotion: "Rentang gerak",
            duration: "Durasi",
            improvementScore: "Skor peningkatan",
            interpretationTitle: "Interpretasi",
        },

        comparison: {
            title: "Bandingkan Dasar vs Umpan Balik",
            bestImprovement: "Peningkatan terbaik",
            hardestMovement: "Gerakan tersulit",
            consistencyTitle: "Konsistensi",
        },

        reflection: {
            title: "Refleksi & Kirim",
            hardestMovementLabel:
                "Gerakan mana yang paling sulit untuk menjaga getaran tetap rendah?",
            wereYouRightLabel: "Apakah prediksi Anda benar?",
            surprisesLabel: "Ada kejutan?",
            submitButton: "Kirim Aktivitas",
        },
    },

    a6: {
        meta: {
            title: "Tantangan Papan Reaksi – Kecepatan, Koordinasi & Konsistensi",
            shortDescription:
                "Ukur waktu reaksi dan akurasi tracing, lalu bandingkan konsistensinya.",
        },

        overview: {
            title: "Ikhtisar",
            summary:
                "Bandingkan waktu reaksi tangan dominan dan non-dominan, lalu evaluasi akurasi tracing.",
        },

        sessionSetup: {
            title: "Pengaturan Sesi",
            subtitle:
                "Atur jumlah peserta, jumlah percobaan, waktu target, dan tracing sebelum mulai.",
            participantCountLabel: "Jumlah peserta",
            trialsPerHandLabel: "Percobaan per tangan",
            delayMinLabel: "Penundaan acak minimum (detik)",
            delayMaxLabel: "Penundaan acak maksimum (detik)",
            targetSizeLabel: "Ukuran target (px)",
            tracingPathTypeLabel: "Jenis jalur tracing",
            accuracyThresholdLabel: "Ambang akurasi (%)",
        },

        prediction: {
            title: "Prediksi",
            predictedReactionTimeLabel: "Prediksi waktu reaksi (ms)",
            predictedReactionTimePlaceholder: "mis. 350",
            predictedHandLabel: "Menurut Anda tangan mana yang akan lebih cepat?",
            continueToReaction: "Lanjut ke Percobaan Reaksi",
        },

        reactionTrial: {
            title: "Percobaan Reaksi",
            instruction: "Ketuk segera setelah target muncul.",
            dominantHand: "Tangan dominan",
            nonDominantHand: "Tangan non-dominan",
            reactionTimeLabel: "Waktu reaksi",
            nextTrial: "Percobaan Berikutnya",
        },

        tracingChallenge: {
            title: "Tantangan Tracing",
            instruction: "Ikuti jalur seakurat mungkin.",
            accuracyLabel: "Akurasi",
            deviationLabel: "Rata-rata deviasi",
            durationLabel: "Durasi tracing",
            continueToResults: "Lanjut ke Hasil",
        },

        results: {
            title: "Hasil",
            meanReactionTime: "Rata-rata waktu reaksi",
            reactionStdDev: "Standar deviasi waktu reaksi",
            tracingAccuracy: "Akurasi tracing",
            interpretationTitle: "Interpretasi",
        },

        reflection: {
            title: "Refleksi & Kirim",
            wereYouRightLabel: "Apakah prediksi Anda benar?",
            surprisesLabel: "Ada kejutan?",
            submitButton: "Kirim Aktivitas",
        },
    },

    a7: {
        meta: {
            title: "Pelatih Irama Pernapasan – Gerak Dada, Laju Napas & Pemulihan",
            shortDescription:
                "Rekam gerak dada, estimasi laju napas, dan bandingkan konsistensi pemulihan.",
        },

        overview: {
            title: "Ikhtisar",
            summary:
                "Ukur laju napas saat istirahat dan setelah olahraga menggunakan gerak dada yang direkam ponsel.",
        },

        sessionSetup: {
            title: "Pengaturan Sesi",
            subtitle:
                "Atur jumlah peserta, durasi pengukuran, dan parameter perekaman sebelum mulai.",
            participantCountLabel: "Jumlah peserta",
            participantCountPlaceholder: "mis. 3",
            durationLabel: "Durasi pengukuran (detik)",
            durationPlaceholder: "mis. 30",
            samplingHzLabel: "Laju sampling target (Hz)",
            smoothingWindowLabel: "Jendela smoothing (detik)",
            minPeakGapLabel: "Jeda minimum antar puncak (ms)",
        },

        prediction: {
            title: "Prediksi",
            predictedRestBpmLabel:
                "Prediksi laju napas saat istirahat (napas/menit)",
            predictedAfterExerciseBpmLabel:
                "Prediksi laju napas setelah olahraga (napas/menit)",
            expectedHighestPhaseLabel:
                "Menurut Anda fase mana yang memiliki laju napas tertinggi?",
            continueToMeasurements: "Lanjut ke Pengukuran",
        },

        measurements: {
            title: "Pengukuran",
            restPhase: "Pengukuran Istirahat",
            postJogPhase: "Pengukuran Setelah Olahraga 1",
            postStarJumpPhase: "Pengukuran Setelah Olahraga 2",
            startMeasurement: "Mulai Pengukuran",
            bpmLabel: "Napas per menit",
            continueToResults: "Lanjut ke Hasil",
        },

        results: {
            title: "Hasil",
            restBpm: "Laju napas saat istirahat",
            postJogBpm: "Laju napas setelah jogging",
            postStarJumpBpm: "Laju napas setelah star jump",
            recoveryConsistency: "Konsistensi pemulihan",
            interpretationTitle: "Interpretasi",
        },

        reflection: {
            title: "Refleksi & Kirim",
            wereYouRightLabel: "Apakah prediksi Anda benar?",
            highestPhaseLabel: "Tahap mana yang memiliki laju napas tertinggi?",
            surprisesLabel: "Ada kejutan?",
            exerciseEffectLabel: "Bagaimana olahraga memengaruhi pernapasan?",
            submitButton: "Kirim Aktivitas",
        },
    },
} as const;

export default activities;