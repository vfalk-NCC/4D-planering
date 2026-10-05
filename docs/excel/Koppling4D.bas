Attribute VB_Name = "Koppling4D"
' ===========================================================================
'  Koppling mellan 4-veckorsplaneringen (Excel) och 4D-planering (Trimble Connect)
'  Version 1 (test) - 2026-10-02
'
'  SkickaTill4D            Skickar hela arbetsboken till 4D-planering. Där visas
'                          "Ny planering från Excel" med förhandsgranskning.
'  HamtaFramdriftFran4D    Hämtar framdriften från 4D och skriver in den i
'                          kolumnen Framdrift (N) på rätt rad. Formler skrivs
'                          aldrig över.
'  Installera4DKnappar     Lägger två knappar på det aktiva bladet.
'  Byt4DToken / Byt4DProjekt   Ändra token eller projekt.
'
'  Token sparas i Windows-registret för din användare (inte i filen).
'  Projekt-id sparas i arbetsbokens egenskaper (inte hemligt).
' ===========================================================================
Option Explicit

Private Const GH_API As String = "https://api.github.com/repos/vfalk-NCC/4D-data/contents/"
Private Const GH_BRANCH As String = "main"
Private Const REG_APP As String = "4D-planering"
Private Const PROP_PROJ As String = "4D-projekt"
Private Const COL_AKTIVITET As Long = 3
Private Const COL_FRAMDRIFT As Long = 14

' JSON-läsare (modulnivå)
Private js As String
Private jp As Long
Private jl As Long

' ---------------------------------------------------------------------------
'  Skicka planeringen till 4D
' ---------------------------------------------------------------------------
Public Sub SkickaTill4D()
    Dim token As String, proj As String, ext As String, tmp As String, b64 As String
    Dim path As String, metaPath As String, meta As String, who As String, sentAt As String
    token = Token4D(): If token = "" Then Exit Sub
    proj = Projekt4D(): If proj = "" Then Exit Sub
    On Error GoTo Fel
    Application.StatusBar = "4D: förbereder filen..."
    ext = LCase$(Mid$(ThisWorkbook.Name, InStrRev(ThisWorkbook.Name, ".") + 1))
    If ext <> "xlsm" And ext <> "xlsx" Then ext = "xlsm"
    tmp = Environ$("TEMP") & "\4D_planering_" & Format$(Now, "yyyymmdd_hhnnss") & "." & ext
    ThisWorkbook.SaveCopyAs tmp
    b64 = FilTillBase64(tmp)
    On Error Resume Next: Kill tmp: On Error GoTo Fel

    path = "projects/" & proj & "/excel_inbox/planering." & ext
    metaPath = "projects/" & proj & "/excel_inbox/meta.json"
    Application.StatusBar = "4D: skickar planeringen (" & Format$(Len(b64) * 3 / 4 / 1048576, "0.0") & " MB)..."
    PutFil token, path, b64, "Excel: planering skickad"

    who = Application.UserName
    sentAt = UtcIso(DateAdd("n", -TidszonMinuter(), Now))
    meta = "{""sent_at"":""" & sentAt & """,""by"":""" & JsonEsc(who) & """,""file"":""" & JsonEsc(ThisWorkbook.Name) & _
           """,""path"":""" & JsonEsc(path) & """,""size"":" & CStr(CLng(Len(b64) * 3 / 4)) & "}"
    PutFil token, metaPath, AsciiTillBase64(meta), "Excel: planering skickad (info)"
    Application.StatusBar = False
    MsgBox "Planeringen är skickad till 4D-planering." & vbCrLf & vbCrLf & _
           "Öppna 4D-planering i Trimble Connect: under Import & verktyg visas " & _
           """Ny planering från Excel"" - granska och importera där.", vbInformation, "4D-planering"
    Exit Sub
Fel:
    Application.StatusBar = False
    MsgBox "Kunde inte skicka till 4D:" & vbCrLf & Err.Description, vbExclamation, "4D-planering"
End Sub

' ---------------------------------------------------------------------------
'  Hämta framdriften från 4D till Excel
' ---------------------------------------------------------------------------
Public Sub HamtaFramdriftFran4D()
    Dim token As String, proj As String
    Dim items As Collection, acts As Collection, actsBy As Object, sums As Object, cnts As Object, texts As Object
    Dim it As Variant, m As Variant, a As Variant, key As Variant, k As String
    Dim prog As Double, found As Boolean, sh As String, ph As String, idx As String
    token = Token4D(): If token = "" Then Exit Sub
    proj = Projekt4D(): If proj = "" Then Exit Sub
    On Error GoTo Fel
    Application.StatusBar = "4D: hämtar framdriften..."
    Set items = ParseJson(HamtaText(token, "projects/" & proj & "/plan_items.json"))
    Set acts = ParseJsonOrEmpty(HamtaText(token, "projects/" & proj & "/plan_item_activities.json"))

    ' Delaktiviteter per objekt
    Set actsBy = CreateObject("Scripting.Dictionary")
    For Each a In acts
        idx = Txt(Falt(a, "plan_item_id"))
        If Not actsBy.Exists(idx) Then actsBy.Add idx, New Collection
        actsBy(idx).Add a
    Next a

    ' Framdrift per rad (medel om aktiviteten är kopplad till flera 3D-objekt)
    Set sums = CreateObject("Scripting.Dictionary")
    Set cnts = CreateObject("Scripting.Dictionary")
    Set texts = CreateObject("Scripting.Dictionary")
    For Each it In items
        If IsObject(it) Then
            sh = Txt(Falt(it, "excel_sheet"))
            If sh <> "" And it.Exists("excel_map") Then
                If IsObject(it("excel_map")) Then
                    For Each m In it("excel_map")
                        ph = Txt(Falt(m, "phase"))
                        found = False
                        If ph = "" Then
                            If Txt(Falt(it, "status")) = "klar" Then prog = 100 Else prog = Tal(Falt(it, "progress"))
                            found = True
                        ElseIf actsBy.Exists(Txt(Falt(it, "id"))) Then
                            For Each a In actsBy(Txt(Falt(it, "id")))
                                If LCase$(Trim$(Txt(Falt(a, "name")))) = LCase$(Trim$(ph)) And Not IsNull(Falt(a, "progress")) Then
                                    prog = Tal(Falt(a, "progress")): found = True: Exit For
                                End If
                            Next a
                        End If
                        If found Then
                            k = sh & "|" & CStr(CLng(Tal(Falt(m, "row"))))
                            sums(k) = Tal(sums(k)) + prog
                            cnts(k) = Tal(cnts(k)) + 1
                            texts(k) = Txt(Falt(m, "text"))
                        End If
                    Next m
                End If
            End If
        End If
    Next it

    ' Jämför med Excel
    Dim ws As Worksheet, r As Long, c As Range, newV As Double, oldV As Double
    Dim chg As New Collection, nUp As Long, nDown As Long, nMiss As Long, nFormula As Long, missList As String
    For Each key In sums.Keys
        sh = Left$(key, InStrRev(key, "|") - 1)
        r = CLng(Mid$(key, InStrRev(key, "|") + 1))
        Set ws = Nothing
        On Error Resume Next: Set ws = ThisWorkbook.Worksheets(sh): On Error GoTo Fel
        If ws Is Nothing Then
            nMiss = nMiss + 1
        Else
            r = HittaRad(ws, r, texts(key))
            If r = 0 Then
                nMiss = nMiss + 1
                If Len(missList) < 400 Then missList = missList & vbCrLf & "  " & sh & ": " & texts(key)
            Else
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
    Next key
    Application.StatusBar = False

    Dim info As String, ans As VbMsgBoxResult, ch As Variant, n As Long
    info = ""
    If nFormula > 0 Then info = info & vbCrLf & nFormula & " rader har en formel i Framdrift och lämnas orörda."
    If nMiss > 0 Then info = info & vbCrLf & nMiss & " rader hittades inte (aktiviteten har bytt namn eller tagits bort):" & missList
    If chg.Count = 0 Then
        MsgBox "Framdriften i Excel stämmer redan med 4D-planering." & info, vbInformation, "4D-planering"
        Exit Sub
    End If
    ans = MsgBox(chg.Count & " rader har annan framdrift i 4D-planering:" & vbCrLf & _
                 "  " & nUp & " har kommit längre i 4D" & vbCrLf & _
                 "  " & nDown & " har lägre framdrift i 4D" & vbCrLf & info & vbCrLf & vbCrLf & _
                 "Ja = skriv in alla" & vbCrLf & _
                 "Nej = bara där 4D har kommit längre (rekommenderas)" & vbCrLf & _
                 "Avbryt = ändra ingenting", vbYesNoCancel + vbQuestion, "Hämta framdrift från 4D")
    If ans = vbCancel Then Exit Sub
    n = 0
    For Each ch In chg
        If ans = vbYes Or ch(3) > ch(2) Then
            ThisWorkbook.Worksheets(ch(0)).Cells(ch(1), COL_FRAMDRIFT).Value = ch(3)
            n = n + 1
        End If
    Next ch
    MsgBox n & " rader uppdaterade med framdriften från 4D-planering.", vbInformation, "4D-planering"
    Exit Sub
Fel:
    Application.StatusBar = False
    MsgBox "Kunde inte hämta framdriften från 4D:" & vbCrLf & Err.Description, vbExclamation, "4D-planering"
End Sub

' Raden där aktiviteten står: samma rad som vid importen om texten stämmer,
' annars den enda raden på bladet med exakt samma text (0 = hittas inte).
Private Function HittaRad(ws As Worksheet, ByVal r As Long, ByVal txt As String) As Long
    Dim last As Long, i As Long, hit As Long, v As Variant
    txt = Trim$(txt)
    If r > 0 Then
        v = ws.Cells(r, COL_AKTIVITET).Value
        If Not IsError(v) Then If Trim$(CStr(v)) = txt Then HittaRad = r: Exit Function
    End If
    last = ws.Cells(ws.Rows.Count, COL_AKTIVITET).End(xlUp).Row
    For i = 5 To last
        v = ws.Cells(i, COL_AKTIVITET).Value
        If Not IsError(v) Then
            If Trim$(CStr(v)) = txt Then
                If hit > 0 Then HittaRad = 0: Exit Function ' flera träffar: osäkert, hoppa över
                hit = i
            End If
        End If
    Next i
    HittaRad = hit
End Function

' ---------------------------------------------------------------------------
'  Knappar, token och projekt
' ---------------------------------------------------------------------------
Public Sub Installera4DKnappar()
    Dim ws As Worksheet, b As Object, l As Double, t As Double
    Set ws = ActiveSheet
    On Error Resume Next
    ws.Buttons("btn4DSkicka").Delete
    ws.Buttons("btn4DHamta").Delete
    On Error GoTo 0
    l = ActiveWindow.VisibleRange.Left + ActiveWindow.VisibleRange.Width - 330
    If l < 10 Then l = 10
    t = ActiveWindow.VisibleRange.Top + 4
    Set b = ws.Buttons.Add(l, t, 150, 24)
    b.OnAction = "SkickaTill4D": b.Caption = "Skicka till 4D": b.Name = "btn4DSkicka"
    Set b = ws.Buttons.Add(l + 160, t, 160, 24)
    b.OnAction = "HamtaFramdriftFran4D": b.Caption = "Hämta framdrift från 4D": b.Name = "btn4DHamta"
    MsgBox "Knapparna ligger nu uppe till höger på bladet """ & ws.Name & """ - dra dem dit du vill." & vbCrLf & _
           "Spara arbetsboken som .xlsm så följer makrot med.", vbInformation, "4D-planering"
End Sub

Public Sub Byt4DToken()
    SaveSetting REG_APP, "GitHub", "Token", ""
    If Token4D() <> "" Then MsgBox "Token sparad på den här datorn.", vbInformation, "4D-planering"
End Sub

Public Sub Byt4DProjekt()
    SattProjekt ""
    If Projekt4D() <> "" Then MsgBox "Projekt sparat i arbetsboken.", vbInformation, "4D-planering"
End Sub

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
        Case 401: FelText = "GitHub godkänner inte token (401). Kör Byt4DToken och ange en giltig token."
        Case 403: FelText = "GitHub nekade åtkomst (403) - har token skrivrätt till 4D-data?"
        Case 404: FelText = "Hittades inte (404): " & path & " - stämmer projekt-id? (Byt4DProjekt)"
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
