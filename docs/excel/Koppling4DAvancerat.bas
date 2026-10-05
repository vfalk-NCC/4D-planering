Attribute VB_Name = "Koppling4DAvancerat"
' ===========================================================================
'  4D-planering - AVANCERAT (fristående modul, test) - 2026-10-05
'
'  Fungerar helt utan den enkla modulen Koppling4D, och den enkla modulen
'  påverkas inte av den här. Ta bort modulen så är allt som förut.
'
'  Avancerat4D             Gör en KOPIA av arbetsboken och skriver i kopian:
'                          - framdriften från 4D (som den enkla hämtningen)
'                          - 4D-ID i en dold kolumn "4D-ID" (raden känns igen
'                            även om den byter namn eller flyttas)
'                          - zonerna från Lägesplan i kolumnerna "Zon (4D)" och
'                            "Överzon (4D)" och på fliken "Zoner (4D)"
'                          - en länk "Visa på kartan" per rad (kolumnen "Karta (4D)")
'                            som öppnar Lägesplan inzoomad på aktiviteten
'                          Kopian öppnas så att du kan granska den. ORIGINALET
'                          ÄNDRAS ALDRIG. Ser kopian bra ut fortsätter du i den.
'  Installera4DAvancerat   Lägger knappen "4D avancerat (kopia)" på bladet.
'  Byt4DTokenAvancerat / Byt4DProjektAvancerat   Ändra token eller projekt.
'
'  Token och projekt-id är desamma som för den enkla modulen.
' ===========================================================================
Option Explicit

Private Const GH_API As String = "https://api.github.com/repos/vfalk-NCC/4D-data/contents/"
Private Const GH_BRANCH As String = "main"
Private Const REG_APP As String = "4D-planering"
Private Const PROP_PROJ As String = "4D-projekt"
Private Const COL_AKTIVITET As Long = 3
Private Const COL_FRAMDRIFT As Long = 14
Private Const RUBRIKRAD As Long = 4
Private Const ZONFLIK As String = "Zoner (4D)"
Private Const LAGESPLAN_URL As String = "https://vfalk-ncc.github.io/4D-planering/lagesplan.html"

' JSON-läsare (modulnivå)
Private js As String
Private jp As Long
Private jl As Long

' Vad makrot gör just nu (visas om något går fel), Excels inställningar och
' skydd som låsts upp tillfälligt i kopian.
Private steg As String
Private sparadCalc As Long
Private arTyst As Boolean
Private upplasta As Collection
Private bokUpplast As Boolean, bokFonster As Boolean

' ---------------------------------------------------------------------------
'  Avancerat: hämta från 4D till en kopia
' ---------------------------------------------------------------------------
Public Sub Avancerat4D()
    Dim token As String, proj As String
    Dim items As Collection, acts As Collection, actsBy As Object, sums As Object, cnts As Object
    Dim texts As Object, ids As Object, zonK As Object, ovzK As Object, rader As Object, zonBy As Object
    Dim zx As Object, harZoner As Boolean, zi As Variant
    Dim it As Variant, m As Variant, a As Variant, key As Variant, k As String, j As Long
    Dim prog As Double, found As Boolean, sh As String, ph As String, idx As String, iid As String
    Dim wb As Workbook, kopia As String, ext As String, bas As String, mapp As String
    Dim ws As Worksheet, r As Long, c As Range, newV As Double, oldV As Double
    Dim hittad As Object, idKols As Object, chg As New Collection, nUp As Long, nDown As Long, nMiss As Long, nFormula As Long, missList As String
    Dim ans As VbMsgBoxResult, ch As Variant, n As Long, nLast As Long, lastaBlad As String
    Dim nId As Long, nZon As Long, idKol As Long, zKol As Long, oKol As Long, blad As Object, shn As Variant
    Dim lKol As Long, nLank As Long
    Dim nyaFlikar As Boolean, zonflikKlar As Boolean, msg As String, felBeskr As String, felNr As Long

    token = Token4D(): If token = "" Then Exit Sub
    proj = Projekt4D(): If proj = "" Then Exit Sub
    If MsgBox("Avancerat - hämta från 4D till en KOPIA av arbetsboken:" & vbCrLf & _
              "  - framdriften (som den vanliga hämtningen)" & vbCrLf & _
              "  - 4D-ID i en dold kolumn" & vbCrLf & _
              "  - zonerna från Lägesplan (kolumner och fliken """ & ZONFLIK & """)" & vbCrLf & _
              "  - länken ""Visa på kartan"" per rad (öppnar Lägesplan på aktiviteten)" & vbCrLf & vbCrLf & _
              "Originalet ändras inte. Kopian sparas bredvid originalet och öppnas så att du kan granska den.", _
              vbOKCancel + vbInformation, "4D avancerat") <> vbOK Then Exit Sub

    On Error GoTo Fel
    steg = "hämtar från 4D-planering"
    Set upplasta = New Collection: bokUpplast = False
    Application.StatusBar = "4D: hämtar framdriften och zonerna..."
    Set items = ParseJson(HamtaText(token, "projects/" & proj & "/plan_items.json"))
    Set acts = ParseJsonOrEmpty(HamtaText(token, "projects/" & proj & "/plan_item_activities.json"))
    steg = "hämtar zonerna från Lägesplan"
    Set zx = ParseJson(HamtaText(token, "projects/" & proj & "/zone_export.json"))
    harZoner = (TypeName(zx) = "Dictionary")

    ' Kopian: samma mapp som originalet, med datum och tid i namnet.
    steg = "sparar en kopia av arbetsboken"
    ext = Mid$(ThisWorkbook.Name, InStrRev(ThisWorkbook.Name, ".") + 1)
    If InStr(ThisWorkbook.Name, ".") = 0 Then ext = "xlsm"
    bas = ThisWorkbook.Name
    If InStrRev(bas, ".") > 0 Then bas = Left$(bas, InStrRev(bas, ".") - 1)
    mapp = ThisWorkbook.Path
    If mapp = "" Or Left$(LCase$(mapp), 4) = "http" Then mapp = Environ$("USERPROFILE") & "\Documents"
    kopia = mapp & "\" & bas & " (4D " & Format$(Now, "yyyy-mm-dd hhnn") & ")." & ext
    ThisWorkbook.SaveCopyAs kopia
    steg = "öppnar kopian"
    Application.EnableEvents = False
    Set wb = Workbooks.Open(kopia, UpdateLinks:=0)
    Application.EnableEvents = True
    Tyst

    ' Zonerna per aktivitet (id -> "7421 Förtjockardelen; ...")
    steg = "läser zonerna"
    Set zonBy = CreateObject("Scripting.Dictionary")
    If harZoner Then
        If IsObject(Falt(zx, "items")) Then
            For Each zi In zx("items")
                zonBy(Txt(Falt(zi, "id"))) = Array(Txt(Falt(zi, "zones")), Txt(Falt(zi, "parents")))
            Next zi
        End If
    End If

    ' Delaktiviteter per objekt
    Set actsBy = CreateObject("Scripting.Dictionary")
    For Each a In acts
        idx = Txt(Falt(a, "plan_item_id"))
        If Not actsBy.Exists(idx) Then actsBy.Add idx, New Collection
        actsBy(idx).Add a
    Next a

    ' Varje Excel-rad som 4D känner till: framdrift (medel om aktiviteten är kopplad
    ' till flera 3D-objekt), id och zoner.
    steg = "går igenom aktiviteterna"
    Set sums = CreateObject("Scripting.Dictionary")
    Set cnts = CreateObject("Scripting.Dictionary")
    Set texts = CreateObject("Scripting.Dictionary")
    Set ids = CreateObject("Scripting.Dictionary")
    Set zonK = CreateObject("Scripting.Dictionary")
    Set ovzK = CreateObject("Scripting.Dictionary")
    Set rader = CreateObject("Scripting.Dictionary")
    For Each it In items
        If IsObject(it) Then
            sh = Txt(Falt(it, "excel_sheet"))
            iid = Txt(Falt(it, "id"))
            If sh <> "" And it.Exists("excel_map") Then
                If IsObject(it("excel_map")) Then
                    j = 0
                    For Each m In it("excel_map")
                        k = sh & "|" & CStr(CLng(Tal(Falt(m, "row"))))
                        If Not rader.Exists(k) Then
                            rader(k) = True
                            texts(k) = Txt(Falt(m, "text"))
                            If j = 0 Then ids(k) = iid Else ids(k) = iid & "#" & CStr(j)
                        End If
                        If zonBy.Exists(iid) Then
                            zonK(k) = Slaihop(Txt(zonK(k)), zonBy(iid)(0))
                            ovzK(k) = Slaihop(Txt(ovzK(k)), zonBy(iid)(1))
                        End If
                        ph = Txt(Falt(m, "phase"))
                        found = False
                        If ph = "" Then
                            If Txt(Falt(it, "status")) = "klar" Then prog = 100 Else prog = Tal(Falt(it, "progress"))
                            found = True
                        ElseIf actsBy.Exists(iid) Then
                            For Each a In actsBy(iid)
                                If LCase$(Trim$(Txt(Falt(a, "name")))) = LCase$(Trim$(ph)) And Not IsNull(Falt(a, "progress")) Then
                                    prog = Tal(Falt(a, "progress")): found = True: Exit For
                                End If
                            Next a
                        End If
                        If found Then
                            sums(k) = Tal(sums(k)) + prog
                            cnts(k) = Tal(cnts(k)) + 1
                        End If
                        j = j + 1
                    Next m
                End If
            End If
        End If
    Next it

    ' Hitta raderna i kopian (på 4D-ID i första hand, annars rad och text)
    Set hittad = CreateObject("Scripting.Dictionary")
    Set idKols = CreateObject("Scripting.Dictionary")
    For Each key In rader.Keys
        sh = Left$(key, InStrRev(key, "|") - 1)
        r = CLng(Mid$(key, InStrRev(key, "|") + 1))
        steg = "letar upp raden för " & texts(key) & " på fliken " & sh
        Set ws = Nothing
        On Error Resume Next: Set ws = wb.Worksheets(sh): On Error GoTo Fel
        If ws Is Nothing Then
            If sums.Exists(key) Then nMiss = nMiss + 1
        Else
            If Not idKols.Exists(sh) Then idKols(sh) = HittaKol(ws, "4D-ID")
            r = HittaRad(ws, r, texts(key), ids(key), idKols(sh))
            If r = 0 Then
                If sums.Exists(key) Then
                    nMiss = nMiss + 1
                    If Len(missList) < 400 Then missList = missList & vbCrLf & "  " & sh & ": " & texts(key)
                End If
            Else
                hittad(key) = r
                If sums.Exists(key) Then
                    Set c = ws.Cells(r, COL_FRAMDRIFT)
                    If c.HasFormula Then
                        nFormula = nFormula + 1
                    Else
                        newV = Round(sums(key) / cnts(key)) / 100
                        If IsNumeric(c.Value) And Not IsEmpty(c.Value) Then oldV = CDbl(c.Value) Else oldV = 0
                        If Abs(newV - oldV) > 0.00001 Then
                            chg.Add Array(ws.Name, r, oldV, newV)
                            If newV > oldV Then nUp = nUp + 1 Else nDown = nDown + 1
                        End If
                    End If
                End If
            End If
        End If
    Next key

    ' Framdriften: samma val som i den vanliga hämtningen.
    ans = vbNo
    If chg.Count > 0 Then
        Vanligt
        ans = MsgBox(chg.Count & " rader har annan framdrift i 4D-planering:" & vbCrLf & _
                     "  " & nUp & " har kommit längre i 4D" & vbCrLf & _
                     "  " & nDown & " har lägre framdrift i 4D" & vbCrLf & vbCrLf & _
                     "Ja = skriv in alla" & vbCrLf & _
                     "Nej = bara där 4D har kommit längre (rekommenderas)" & vbCrLf & _
                     "Avbryt = ingen framdrift (4D-ID och zoner skrivs ändå i kopian)" & vbCrLf & vbCrLf & _
                     "Det här gäller bara kopian - originalet ändras inte.", vbYesNoCancel + vbQuestion, "4D avancerat")
        Tyst
    End If
    steg = "kontrollerar arbetsbokens skydd"
    nyaFlikar = LasUppBok(wb)
    n = 0
    If ans <> vbCancel Then
        For Each ch In chg
            If ans = vbYes Or ch(3) > ch(2) Then
                Set c = wb.Worksheets(ch(0)).Cells(ch(1), COL_FRAMDRIFT)
                steg = "skriver framdrift på fliken " & ch(0) & ", rad " & ch(1)
                If KanSkriva(c) Then
                    c.Value = ch(3)
                    n = n + 1
                Else
                    nLast = nLast + 1
                    If InStr(lastaBlad, "[" & ch(0) & "]") = 0 Then lastaBlad = lastaBlad & "[" & ch(0) & "]"
                End If
            End If
        Next ch
    End If

    ' 4D-ID och zoner på raderna
    Set blad = CreateObject("Scripting.Dictionary")
    For Each key In hittad.Keys
        blad(Left$(key, InStrRev(key, "|") - 1)) = True
    Next key
    For Each shn In blad.Keys
        Application.StatusBar = "4D: skriver 4D-ID och zoner på fliken " & shn & "..."
        DoEvents
        Set ws = wb.Worksheets(shn)
        steg = "låser upp fliken " & shn
        If Not LasUppBlad(ws) Then
            If InStr(lastaBlad, "[" & shn & "]") = 0 Then lastaBlad = lastaBlad & "[" & shn & "]"
        Else
            steg = "lägger till kolumnen 4D-ID på fliken " & shn
            idKol = SkapaKol(ws, "4D-ID", True)
            If harZoner Then
                steg = "lägger till zonkolumnerna på fliken " & shn
                zKol = SkapaKol(ws, "Zon (4D)", False)
                oKol = SkapaKol(ws, "Överzon (4D)", False)
            End If
            steg = "lägger till kolumnen Karta (4D) på fliken " & shn
            lKol = SkapaKol(ws, "Karta (4D)", False)
            For Each key In hittad.Keys
                If Left$(key, InStrRev(key, "|") - 1) = shn Then
                    r = hittad(key)
                    steg = "skriver 4D-ID och zon på fliken " & shn & ", rad " & r
                    If SattCell(ws.Cells(r, idKol), ids(key)) Then nId = nId + 1
                    If harZoner Then
                        If SattCell(ws.Cells(r, zKol), Txt(zonK(key))) Then nZon = nZon + 1
                        SattCell ws.Cells(r, oKol), Txt(ovzK(key))
                    End If
                    If SattLank(ws.Cells(r, lKol), LAGESPLAN_URL & "?project=" & proj & "&item=" & Split(ids(key), "#")(0)) Then nLank = nLank + 1
                End If
            Next key
        End If
    Next shn

    ' Fliken med zonerna
    If harZoner And nyaFlikar Then
        steg = "skriver fliken " & ZONFLIK
        SkrivZonflik wb, zx
        zonflikKlar = True
    End If

    steg = "låser flikarna igen och sparar kopian"
    LasIgen wb
    Vanligt
    wb.Save
    wb.Activate

    msg = "Kopian är klar och öppen:" & vbCrLf & "  " & wb.Name & vbCrLf & vbCrLf & _
          n & " rader fick framdriften från 4D-planering." & vbCrLf & _
          nId & " rader fick 4D-ID." & vbCrLf & _
          nLank & " rader fick länken ""Visa på kartan"" (kolumnen ""Karta (4D)"")."
    If harZoner Then
        msg = msg & vbCrLf & nZon & " rader fick zon (kolumnerna ""Zon (4D)"" och ""Överzon (4D)"")" & _
              IIf(zonflikKlar, " och fliken """ & ZONFLIK & """ är skriven.", ".")
    Else
        msg = msg & vbCrLf & "Inga zoner från Lägesplan än (öppna Lägesplan i 4D-planering så sparas de)."
    End If
    If nFormula > 0 Then msg = msg & vbCrLf & nFormula & " rader har en formel i Framdrift och lämnades orörda."
    If nMiss > 0 Then msg = msg & vbCrLf & nMiss & " rader hittades inte:" & missList
    If lastaBlad <> "" Then msg = msg & vbCrLf & "Låst med lösenord (hoppades över" & IIf(nLast > 0, ", " & nLast & " rader framdrift", "") & "): " & Replace(Replace(Mid$(lastaBlad, 2, Len(lastaBlad) - 2), "][", ", "), "]", "")
    If harZoner And Not nyaFlikar Then msg = msg & vbCrLf & "Arbetsbokens struktur är låst med lösenord, så fliken """ & ZONFLIK & """ kunde inte läggas till."
    msg = msg & vbCrLf & vbCrLf & "Originalet är orört. Ser kopian bra ut: fortsätt arbeta i den. Annars: stäng den."
    MsgBox msg, vbInformation, "4D avancerat"
    Exit Sub
Fel:
    felBeskr = Err.Description: felNr = Err.Number
    On Error GoTo -1
    On Error Resume Next
    Application.EnableEvents = True
    If Not wb Is Nothing Then LasIgen wb
    Vanligt
    ' Kopian stängs utan att sparas och tas bort - originalet är orört.
    If Not wb Is Nothing Then wb.Close SaveChanges:=False
    If kopia <> "" Then Kill kopia
    On Error GoTo 0
    MsgBox "Kunde inte hämta från 4D:" & vbCrLf & felBeskr & vbCrLf & vbCrLf & _
           "Steg: " & steg & " (fel " & felNr & ")" & vbCrLf & vbCrLf & _
           "Originalet är orört (kopian är borttagen).", vbExclamation, "4D avancerat"
End Sub

' Raden där aktiviteten står: i första hand raden med samma 4D-ID (bara om id:t
' finns på en enda rad), annars samma rad som vid importen om texten stämmer,
' annars den enda raden på bladet med exakt samma text (0 = hittas inte).
' En rad som redan har ett annat 4D-ID hör till en annan aktivitet.
Private Function HittaRad(ws As Worksheet, ByVal r As Long, ByVal txt As String, ByVal id As String, ByVal idKol As Long) As Long
    Dim last As Long, i As Long, hit As Long, v As Variant, f As Range, g As Range
    txt = Trim$(txt)
    If idKol > 0 And id <> "" Then
        If r > 0 Then
            If CellText(ws.Cells(r, idKol)) = id Then HittaRad = r: Exit Function
        End If
        Set f = ws.Columns(idKol).Find(What:=id, LookIn:=xlFormulas, LookAt:=xlWhole, MatchCase:=True)
        If Not f Is Nothing Then
            Set g = ws.Columns(idKol).FindNext(f)
            If g.Row = f.Row Then HittaRad = f.Row: Exit Function ' annars kopierad rad: osäkert, gå på texten
        End If
    End If
    If r > 0 Then
        v = ws.Cells(r, COL_AKTIVITET).Value
        If Not IsError(v) Then
            If Trim$(CStr(v)) = txt And AnnatId(ws, r, id, idKol) = False Then HittaRad = r: Exit Function
        End If
    End If
    last = ws.Cells(ws.Rows.Count, COL_AKTIVITET).End(xlUp).Row
    For i = 5 To last
        v = ws.Cells(i, COL_AKTIVITET).Value
        If Not IsError(v) Then
            If Trim$(CStr(v)) = txt And AnnatId(ws, i, id, idKol) = False Then
                If hit > 0 Then HittaRad = 0: Exit Function ' flera träffar: osäkert, hoppa över
                hit = i
            End If
        End If
    Next i
    HittaRad = hit
End Function

Private Function AnnatId(ws As Worksheet, ByVal r As Long, ByVal id As String, ByVal idKol As Long) As Boolean
    Dim t As String
    If idKol = 0 Then Exit Function
    t = CellText(ws.Cells(r, idKol))
    AnnatId = (t <> "" And t <> id)
End Function

Private Function CellText(c As Range) As String
    Dim v As Variant
    v = c.Value
    If IsError(v) Or IsEmpty(v) Then CellText = "" Else CellText = Trim$(CStr(v))
End Function

' "a; b" + "b; c" -> "a; b; c"
Private Function Slaihop(ByVal a As String, ByVal b As String) As String
    Dim p As Variant, t As String
    Slaihop = a
    If b = "" Then Exit Function
    For Each p In Split(b, "; ")
        t = Trim$(CStr(p))
        If t <> "" Then
            If Slaihop = "" Then
                Slaihop = t
            ElseIf InStr(1, "; " & Slaihop & "; ", "; " & t & "; ", vbBinaryCompare) = 0 Then
                Slaihop = Slaihop & "; " & t
            End If
        End If
    Next p
End Function

' ---------------------------------------------------------------------------
'  Kolumner och zonflik
' ---------------------------------------------------------------------------
Private Function HittaKol(ws As Worksheet, ByVal rubrik As String) As Long
    Dim c As Long, last As Long, v As Variant
    last = ws.Cells(RUBRIKRAD, ws.Columns.Count).End(xlToLeft).Column
    If last < 2 Then
        If UCase$(CellText(ws.Cells(RUBRIKRAD, 1))) = UCase$(rubrik) Then HittaKol = 1
        Exit Function
    End If
    v = ws.Range(ws.Cells(RUBRIKRAD, 1), ws.Cells(RUBRIKRAD, last)).Value ' en läsning
    For c = 1 To last
        If Not IsError(v(1, c)) Then
            If UCase$(Trim$(CStr(v(1, c)))) = UCase$(rubrik) Then HittaKol = c: Exit Function
        End If
    Next c
End Function

' Sista kolumnen med innehåll (inte bara formatering) på bladet.
Private Function SistaKol(ws As Worksheet) As Long
    Dim f As Range
    Set f = ws.Cells.Find(What:="*", LookIn:=xlFormulas, SearchOrder:=xlByColumns, SearchDirection:=xlPrevious)
    If f Is Nothing Then SistaKol = 0 Else SistaKol = f.Column
End Function

' Kolumnen med rubriken (rad 4), eller en ny helt tom kolumn utan sammanfogade
' celler till höger om allt annat.
Private Function SkapaKol(ws As Worksheet, ByVal rubrik As String, ByVal dold As Boolean) As Long
    Dim c As Long
    c = HittaKol(ws, rubrik)
    If c = 0 Then
        c = SistaKol(ws) + 1
        If c < 18 Then c = 18 ' efter kolumn Q
        Do While c < ws.Columns.Count
            If Application.WorksheetFunction.CountA(ws.Columns(c)) = 0 And Not IsNull(ws.Columns(c).MergeCells) Then
                If ws.Columns(c).MergeCells = False Then Exit Do
            End If
            c = c + 1
        Loop
        If c >= ws.Columns.Count Then Err.Raise vbObjectError + 5, , "Ingen ledig kolumn för """ & rubrik & """ på fliken " & ws.Name
        ws.Cells(RUBRIKRAD, c).Value = rubrik
        ws.Cells(RUBRIKRAD, c).Font.Bold = True
        If dold Then ws.Columns(c).Hidden = True Else ws.Columns(c).ColumnWidth = 24
    End If
    SkapaKol = c
End Function

' Skriver ett värde om det skiljer sig. True om cellen ändrades.
Private Function SattCell(c As Range, ByVal v As String) As Boolean
    If c.HasFormula Or c.MergeCells Then Exit Function
    If CellText(c) = v Then Exit Function
    If v = "" Then c.ClearContents Else c.Value = "'" & v
    SattCell = True
End Function

' Länken "Visa på kartan" i cellen (skrivs bara om om adressen ändrats). True om ändrad.
Private Function SattLank(c As Range, ByVal url As String) As Boolean
    If c.HasFormula Or c.MergeCells Then Exit Function
    If c.Hyperlinks.Count > 0 Then
        If c.Hyperlinks(1).Address = url Then Exit Function
        c.Hyperlinks.Delete
    End If
    c.Worksheet.Hyperlinks.Add Anchor:=c, Address:=url, TextToDisplay:="Visa på kartan"
    SattLank = True
End Function

' Skriver fliken "Zoner (4D)" i kopian (en gammal flik med samma namn ersätts).
Private Sub SkrivZonflik(wb As Workbook, zx As Object)
    Dim ws As Worksheet, gammal As Worksheet, r As Long, pz As Variant, z As Variant, flera As Boolean
    Dim planer As Object
    Set gammal = Nothing
    On Error Resume Next: Set gammal = wb.Worksheets(ZONFLIK): On Error GoTo 0
    If Not gammal Is Nothing Then
        Application.DisplayAlerts = False
        gammal.Delete
        Application.DisplayAlerts = True
    End If
    Set ws = wb.Worksheets.Add(After:=wb.Sheets(wb.Sheets.Count))
    ws.Name = ZONFLIK
    Set planer = CreateObject("Scripting.Dictionary")
    If IsObject(Falt(zx, "zones")) Then
        For Each z In zx("zones"): planer(Txt(Falt(z, "plan"))) = True: Next z
    End If
    flera = (planer.Count > 1)
    ws.Cells(1, 1).Value = "Zoner från 4D-planering (Lägesplan)"
    ws.Cells(1, 1).Font.Bold = True: ws.Cells(1, 1).Font.Size = 14
    ws.Cells(2, 1).Value = "'Uppdaterad " & Replace(Left$(Txt(Falt(zx, "updated_at")), 16), "T", " ") & " UTC" & _
                           IIf(Txt(Falt(zx, "by")) <> "", " av " & Txt(Falt(zx, "by")), "") & ". Status per " & Txt(Falt(zx, "date")) & "."
    ws.Range("A4:J4").Value = Array("Arbetsyta", "Överzon", "Zon", "Namn", "Yta m²", "Aktiviteter", "Framdrift", "Status", "Start", "Slut")
    ws.Range("A4:J4").Font.Bold = True
    ws.Range("A4:J4").Interior.Color = RGB(226, 232, 240)
    r = 5
    If IsObject(Falt(zx, "parents")) And IsObject(Falt(zx, "zones")) Then
        For Each pz In zx("parents")
            ZonRad ws, r, Txt(Falt(pz, "plan")), Txt(Falt(pz, "name")), "", "", pz
            ws.Range(ws.Cells(r, 1), ws.Cells(r, 10)).Font.Bold = True
            ws.Range(ws.Cells(r, 1), ws.Cells(r, 10)).Interior.Color = RGB(241, 245, 249)
            r = r + 1
            For Each z In zx("zones")
                If Txt(Falt(z, "plan")) = Txt(Falt(pz, "plan")) And UCase$(Txt(Falt(z, "parent"))) = UCase$(Txt(Falt(pz, "name"))) Then
                    ZonRad ws, r, Txt(Falt(z, "plan")), Txt(Falt(z, "parent")), Txt(Falt(z, "code")), Txt(Falt(z, "name")), z
                    ws.Cells(r, 3).IndentLevel = 1
                    r = r + 1
                End If
            Next z
        Next pz
    End If
    If IsObject(Falt(zx, "zones")) Then
        For Each z In zx("zones")
            If Txt(Falt(z, "parent")) = "" Then
                ZonRad ws, r, Txt(Falt(z, "plan")), "", Txt(Falt(z, "code")), Txt(Falt(z, "name")), z
                r = r + 1
            End If
        Next z
    End If
    ws.Columns("A:J").AutoFit
    If Not flera Then ws.Columns(1).Hidden = True
End Sub

Private Sub ZonRad(ws As Worksheet, ByVal r As Long, ByVal arbetsyta As String, ByVal ovz As String, ByVal kod As String, ByVal namn As String, z As Variant)
    ws.Cells(r, 1).Value = "'" & arbetsyta
    ws.Cells(r, 2).Value = "'" & ovz
    ws.Cells(r, 3).Value = "'" & kod
    ws.Cells(r, 4).Value = "'" & namn
    If Not IsNull(Falt(z, "area_m2")) Then ws.Cells(r, 5).Value = Tal(Falt(z, "area_m2")): ws.Cells(r, 5).NumberFormat = "#,##0"
    ws.Cells(r, 6).Value = Tal(Falt(z, "items"))
    If Not IsNull(Falt(z, "progress")) Then ws.Cells(r, 7).Value = Tal(Falt(z, "progress")) / 100: ws.Cells(r, 7).NumberFormat = "0%"
    ws.Cells(r, 8).Value = Txt(Falt(z, "status"))
    SattDatum ws.Cells(r, 9), Txt(Falt(z, "start"))
    SattDatum ws.Cells(r, 10), Txt(Falt(z, "end"))
End Sub

Private Sub SattDatum(c As Range, ByVal iso As String)
    If Len(iso) < 10 Then Exit Sub
    c.Value = DateSerial(CInt(Left$(iso, 4)), CInt(Mid$(iso, 6, 2)), CInt(Mid$(iso, 9, 2)))
    c.NumberFormat = "yyyy-mm-dd"
End Sub

' ---------------------------------------------------------------------------
'  Skydd och snabbt läge (gäller bara kopian)
' ---------------------------------------------------------------------------
' Får cellen skrivas? (bladet olåst, eller cellen olåst, eller bladet gick att låsa upp)
Private Function KanSkriva(c As Range) As Boolean
    If Not c.Worksheet.ProtectContents Then KanSkriva = True: Exit Function
    If Not c.Locked Then KanSkriva = True: Exit Function
    KanSkriva = LasUppBlad(c.Worksheet)
End Function

' Låser upp ett skyddat blad om det saknar lösenord (låses igen med samma val i LasIgen).
' False om bladet har lösenord.
Private Function LasUppBlad(ws As Worksheet) As Boolean
    Dim p As Object
    If Not ws.ProtectContents Then LasUppBlad = True: Exit Function
    Set p = ws.Protection
    upplasta.Add Array(ws, ws.ProtectDrawingObjects, ws.ProtectScenarios, p.AllowFormattingCells, p.AllowFormattingColumns, _
                       p.AllowFormattingRows, p.AllowInsertingColumns, p.AllowInsertingRows, p.AllowInsertingHyperlinks, _
                       p.AllowDeletingColumns, p.AllowDeletingRows, p.AllowSorting, p.AllowFiltering, p.AllowUsingPivotTables)
    On Error Resume Next
    ws.Unprotect ""
    On Error GoTo 0
    If ws.ProtectContents Then
        upplasta.Remove upplasta.Count
        LasUppBlad = False
    Else
        LasUppBlad = True
    End If
End Function

' Låser upp arbetsbokens struktur (för nya flikar) om den saknar lösenord. False om lösenord.
Private Function LasUppBok(wb As Workbook) As Boolean
    If Not wb.ProtectStructure Then LasUppBok = True: Exit Function
    bokFonster = wb.ProtectWindows
    On Error Resume Next
    wb.Unprotect ""
    On Error GoTo 0
    If wb.ProtectStructure Then Exit Function
    bokUpplast = True
    LasUppBok = True
End Function

' Låser allt som låstes upp igen, med samma val som förut.
Private Sub LasIgen(wb As Workbook)
    Dim e As Variant
    On Error Resume Next
    If Not upplasta Is Nothing Then
        For Each e In upplasta
            e(0).Protect DrawingObjects:=e(1), Contents:=True, Scenarios:=e(2), AllowFormattingCells:=e(3), _
                AllowFormattingColumns:=e(4), AllowFormattingRows:=e(5), AllowInsertingColumns:=e(6), AllowInsertingRows:=e(7), _
                AllowInsertingHyperlinks:=e(8), AllowDeletingColumns:=e(9), AllowDeletingRows:=e(10), AllowSorting:=e(11), _
                AllowFiltering:=e(12), AllowUsingPivotTables:=e(13)
        Next e
        Set upplasta = New Collection
    End If
    If bokUpplast Then wb.Protect Structure:=True, Windows:=bokFonster: bokUpplast = False
End Sub

' Snabbt läge: ingen omräkning, inga händelsemakron, ingen skärmuppdatering.
Private Sub Tyst()
    If arTyst Then Exit Sub
    sparadCalc = Application.Calculation
    Application.ScreenUpdating = False
    Application.EnableEvents = False
    Application.Calculation = xlCalculationManual
    arTyst = True
End Sub

Private Sub Vanligt()
    If arTyst Then
        Application.Calculation = sparadCalc
        Application.EnableEvents = True
        arTyst = False
    End If
    Application.ScreenUpdating = True
    Application.StatusBar = False
End Sub

' ---------------------------------------------------------------------------
'  Knapp
' ---------------------------------------------------------------------------
Public Sub Installera4DAvancerat()
    Dim ws As Worksheet, b As Object, l As Double, t As Double
    Set ws = ActiveSheet
    On Error Resume Next
    ws.Buttons("btn4DAvancerat").Delete
    On Error GoTo 0
    l = ActiveWindow.VisibleRange.Left + ActiveWindow.VisibleRange.Width - 330
    If l < 10 Then l = 10
    t = ActiveWindow.VisibleRange.Top + 32
    Set b = ws.Buttons.Add(l, t, 320, 24)
    b.OnAction = "Avancerat4D": b.Caption = "4D avancerat (kopia: framdrift, 4D-ID, zoner, karta)": b.Name = "btn4DAvancerat"
    MsgBox "Knappen ligger nu uppe till höger på bladet """ & ws.Name & """ - dra den dit du vill." & vbCrLf & _
           "Den gör alltid en kopia av arbetsboken - originalet ändras aldrig.", vbInformation, "4D avancerat"
End Sub

Public Sub Byt4DTokenAvancerat()
    SaveSetting REG_APP, "GitHub", "Token", ""
    If Token4D() <> "" Then MsgBox "Token sparad på den här datorn.", vbInformation, "4D avancerat"
End Sub

Public Sub Byt4DProjektAvancerat()
    SattProjekt ""
    If Projekt4D() <> "" Then MsgBox "Projekt sparat i arbetsboken.", vbInformation, "4D avancerat"
End Sub

' ---------------------------------------------------------------------------
'  Token, projekt, GitHub och JSON (samma som i den enkla modulen)
' ---------------------------------------------------------------------------
Private Function Token4D() As String
    Dim t As String
    t = GetSetting(REG_APP, "GitHub", "Token", "")
    If t = "" Then
        t = Trim$(InputBox("GitHub-token för 4D-planering (samma som under Inställningar i 4D-planering)." & vbCrLf & vbCrLf & _
                           "Den sparas bara på den här datorn, inte i Excel-filen.", "4D-planering"))
        If t <> "" Then SaveSetting REG_APP, "GitHub", "Token", t
    End If
    Token4D = t
End Function

Private Function Projekt4D() As String
    Dim p As String
    On Error Resume Next
    p = CStr(ThisWorkbook.CustomDocumentProperties(PROP_PROJ).Value)
    On Error GoTo 0
    If p = "" Then
        p = Trim$(InputBox("Projekt-id i 4D-planering." & vbCrLf & vbCrLf & _
                           "Finns i 4D-planering under Import & verktyg -> Koppla Excel direkt -> Kopiera.", "4D-planering"))
        If p <> "" Then SattProjekt p
    End If
    Projekt4D = p
End Function

Private Sub SattProjekt(ByVal p As String)
    On Error Resume Next
    ThisWorkbook.CustomDocumentProperties(PROP_PROJ).Delete
    On Error GoTo 0
    If p <> "" Then ThisWorkbook.CustomDocumentProperties.Add Name:=PROP_PROJ, LinkToContent:=False, Type:=4, Value:=p
End Sub

' ---------------------------------------------------------------------------
'  GitHub
' ---------------------------------------------------------------------------
Private Function NyHttp(ByVal method As String, ByVal url As String, ByVal token As String, ByVal accept As String) As Object
    Dim x As Object
    Set x = CreateObject("MSXML2.XMLHTTP.6.0")
    x.Open method, url, False
    x.setRequestHeader "Authorization", "Bearer " & token
    x.setRequestHeader "Accept", accept
    x.setRequestHeader "X-GitHub-Api-Version", "2022-11-28"
    x.setRequestHeader "Cache-Control", "no-cache"
    x.setRequestHeader "If-Modified-Since", "Sat, 1 Jan 2000 00:00:00 GMT"
    Set NyHttp = x
End Function

Private Function Url(ByVal path As String) As String
    Url = GH_API & path & "?ref=" & GH_BRANCH & "&t=" & Format$(Now, "yyyymmddhhnnss") & CStr(Int(Rnd * 100000))
End Function

Private Function HamtaSha(ByVal token As String, ByVal path As String) As String
    Dim x As Object, s As String, i As Long, j As Long
    Set x = NyHttp("GET", Url(path), token, "application/vnd.github+json")
    x.send
    If x.Status = 404 Then HamtaSha = "": Exit Function
    If x.Status <> 200 Then Err.Raise vbObjectError + 1, , FelText(x, path)
    s = x.responseText
    i = InStr(s, """sha"":""")
    If i = 0 Then HamtaSha = "": Exit Function
    i = i + 7: j = InStr(i, s, """")
    HamtaSha = Mid$(s, i, j - i)
End Function

Private Sub PutFil(ByVal token As String, ByVal path As String, ByVal b64 As String, ByVal msg As String)
    Dim x As Object, sha As String, body As String, forsok As Long
    For forsok = 1 To 4
        sha = HamtaSha(token, path)
        body = "{""message"":""" & JsonEsc(msg) & """,""branch"":""" & GH_BRANCH & """,""content"":""" & b64 & """"
        If sha <> "" Then body = body & ",""sha"":""" & sha & """"
        body = body & "}"
        Set x = NyHttp("PUT", GH_API & path, token, "application/vnd.github+json")
        x.setRequestHeader "Content-Type", "application/json"
        x.send body
        If x.Status = 200 Or x.Status = 201 Then Exit Sub
        If x.Status <> 409 And x.Status <> 422 Then Exit For
        Application.Wait Now + TimeSerial(0, 0, forsok)
    Next forsok
    Err.Raise vbObjectError + 2, , FelText(x, path)
End Sub

Private Function HamtaText(ByVal token As String, ByVal path As String) As String
    Dim x As Object
    Set x = NyHttp("GET", Url(path), token, "application/vnd.github.raw")
    x.send
    If x.Status = 404 Then HamtaText = "[]": Exit Function
    If x.Status <> 200 Then Err.Raise vbObjectError + 3, , FelText(x, path)
    HamtaText = Utf8Text(x.responseBody)
End Function

Private Function FelText(x As Object, ByVal path As String) As String
    Select Case x.Status
        Case 401: FelText = "GitHub godkänner inte token (401). Kör Byt4DTokenAvancerat och ange en giltig token."
        Case 403: FelText = "GitHub nekade åtkomst (403) - har token skrivrätt till 4D-data?"
        Case 404: FelText = "Hittades inte (404): " & path & " - stämmer projekt-id? (Byt4DProjektAvancerat)"
        Case Else: FelText = "GitHub svarade " & x.Status & " för " & path & ": " & Left$(x.responseText, 200)
    End Select
End Function

' ---------------------------------------------------------------------------
'  Kodning
' ---------------------------------------------------------------------------
Private Function FilTillBase64(ByVal path As String) As String
    Dim f As Integer, b() As Byte, dom As Object, el As Object
    f = FreeFile
    Open path For Binary Access Read As #f
    ReDim b(0 To LOF(f) - 1)
    Get #f, , b
    Close #f
    Set dom = CreateObject("MSXML2.DOMDocument.6.0")
    Set el = dom.createElement("b")
    el.DataType = "bin.base64"
    el.nodeTypedValue = b
    FilTillBase64 = Replace(Replace(el.Text, vbLf, ""), vbCr, "")
End Function

Private Function AsciiTillBase64(ByVal s As String) As String
    Dim dom As Object, el As Object, b() As Byte
    b = StrConv(s, vbFromUnicode)
    Set dom = CreateObject("MSXML2.DOMDocument.6.0")
    Set el = dom.createElement("b")
    el.DataType = "bin.base64"
    el.nodeTypedValue = b
    AsciiTillBase64 = Replace(Replace(el.Text, vbLf, ""), vbCr, "")
End Function

Private Function Utf8Text(bytes As Variant) As String
    Dim st As Object
    Set st = CreateObject("ADODB.Stream")
    st.Type = 1: st.Open: st.Write bytes
    st.Position = 0: st.Type = 2: st.Charset = "utf-8"
    Utf8Text = st.ReadText
    st.Close
End Function

' JSON-sträng med bara ASCII (åäö som å osv.)
Private Function JsonEsc(ByVal s As String) As String
    Dim i As Long, c As Long, out As String
    For i = 1 To Len(s)
        c = AscW(Mid$(s, i, 1)) And &HFFFF&
        Select Case c
            Case 34: out = out & "\"""
            Case 92: out = out & "\\"
            Case 0 To 31, Is > 126: out = out & "\u" & Right$("000" & LCase$(Hex$(c)), 4)
            Case Else: out = out & ChrW(c)
        End Select
    Next i
    JsonEsc = out
End Function

' Tid som "2026-10-02T12:32:05Z" (oberoende av Windows-inställningarna).
Private Function UtcIso(ByVal d As Date) As String
    UtcIso = Year(d) & "-" & Format$(Month(d), "00") & "-" & Format$(Day(d), "00") & "T" & _
             Format$(Hour(d), "00") & ":" & Format$(Minute(d), "00") & ":" & Format$(Second(d), "00") & "Z"
End Function

' Minuter som lokal tid ligger före UTC (för sent_at i UTC).
Private Function TidszonMinuter() As Long
    Dim wmi As Object, os As Object
    On Error Resume Next
    Set wmi = GetObject("winmgmts:\\.\root\cimv2")
    For Each os In wmi.ExecQuery("Select CurrentTimeZone from Win32_OperatingSystem")
        TidszonMinuter = os.CurrentTimeZone
    Next os
End Function

' ---------------------------------------------------------------------------
'  JSON (läser plan_items.json m.fl.): objekt -> Scripting.Dictionary,
'  listor -> Collection, tal -> Double, null -> Null.
' ---------------------------------------------------------------------------
Private Function ParseJson(ByVal s As String) As Object
    Dim v As Variant
    js = s: jp = 1: jl = Len(s)
    JVal v
    If Not IsObject(v) Then Err.Raise vbObjectError + 4, , "Oväntat svar från 4D (inte JSON)"
    Set ParseJson = v
End Function

Private Function ParseJsonOrEmpty(ByVal s As String) As Collection
    Dim o As Object
    Set o = ParseJson(s)
    If TypeName(o) = "Collection" Then Set ParseJsonOrEmpty = o Else Set ParseJsonOrEmpty = New Collection
End Function

Private Sub SkipWs()
    Dim c As Long
    Do While jp <= jl
        c = AscW(Mid$(js, jp, 1))
        If c = 32 Or c = 9 Or c = 10 Or c = 13 Then jp = jp + 1 Else Exit Do
    Loop
End Sub

Private Sub JVal(ByRef v As Variant)
    SkipWs
    Select Case Mid$(js, jp, 1)
        Case "{": Set v = JObj()
        Case "[": Set v = JArr()
        Case """": v = JStr()
        Case "t": jp = jp + 4: v = True
        Case "f": jp = jp + 5: v = False
        Case "n": jp = jp + 4: v = Null
        Case Else: v = JNum()
    End Select
End Sub

Private Function JObj() As Object
    Dim d As Object, k As String, v As Variant, c As String
    Set d = CreateObject("Scripting.Dictionary")
    jp = jp + 1: SkipWs
    If Mid$(js, jp, 1) = "}" Then jp = jp + 1: Set JObj = d: Exit Function
    Do
        SkipWs
        k = JStr()
        SkipWs
        jp = jp + 1 ' :
        v = Empty
        JVal v
        If IsObject(v) Then Set d(k) = v Else d(k) = v
        SkipWs
        c = Mid$(js, jp, 1): jp = jp + 1
        If c = "}" Or jp > jl Then Exit Do
    Loop
    Set JObj = d
End Function

Private Function JArr() As Collection
    Dim col As New Collection, v As Variant, c As String
    jp = jp + 1: SkipWs
    If Mid$(js, jp, 1) = "]" Then jp = jp + 1: Set JArr = col: Exit Function
    Do
        v = Empty
        JVal v
        col.Add v
        SkipWs
        c = Mid$(js, jp, 1): jp = jp + 1
        If c = "]" Or jp > jl Then Exit Do
    Loop
    Set JArr = col
End Function

Private Function JStr() As String
    Dim out As String, q As Long, b As Long, e As String
    jp = jp + 1
    Do
        q = InStr(jp, js, """")
        If q = 0 Then jp = jl + 1: Exit Do
        b = InStr(jp, js, "\")
        If b > 0 And b < q Then
            out = out & Mid$(js, jp, b - jp)
            e = Mid$(js, b + 1, 1)
            Select Case e
                Case "n": out = out & vbLf: jp = b + 2
                Case "t": out = out & vbTab: jp = b + 2
                Case "r": out = out & vbCr: jp = b + 2
                Case "b", "f": jp = b + 2
                Case "u": out = out & ChrW(CLng("&H" & Mid$(js, b + 2, 4))): jp = b + 6
                Case Else: out = out & e: jp = b + 2
            End Select
        Else
            out = out & Mid$(js, jp, q - jp)
            jp = q + 1
            Exit Do
        End If
    Loop
    JStr = out
End Function

Private Function JNum() As Double
    Dim st As Long
    st = jp
    Do While jp <= jl
        If InStr("+-0123456789.eE", Mid$(js, jp, 1)) = 0 Then Exit Do
        jp = jp + 1
    Loop
    JNum = Val(Mid$(js, st, jp - st))
End Function

' Falt ur ett JSON-objekt (Null/"" om det saknas)
Private Function Falt(o As Variant, ByVal k As String) As Variant
    Falt = Null
    If Not IsObject(o) Then Exit Function
    If TypeName(o) <> "Dictionary" Then Exit Function
    If Not o.Exists(k) Then Exit Function
    If IsObject(o(k)) Then Set Falt = o(k) Else Falt = o(k)
End Function

Private Function Txt(v As Variant) As String
    If IsObject(v) Then Txt = "": Exit Function
    If IsNull(v) Or IsEmpty(v) Then Txt = "" Else Txt = CStr(v)
End Function

Private Function Tal(v As Variant) As Double
    If IsNull(v) Or IsEmpty(v) Then Tal = 0: Exit Function
    If IsNumeric(v) Then Tal = CDbl(v) Else Tal = 0
End Function
