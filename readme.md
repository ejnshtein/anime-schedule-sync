# What is this

This app is using to "upload" anime schedule from Google Sheets to Google Calendar.
After that it's easier to maintain in calendar.

_Development continues_

GCalendar: [https://dsgstng.com/gcalendar](https://dsgstng.com/gcalendar) or [direct link](https://calendar.google.com/calendar?cid=cWNlbnRyeTAxQGdtYWlsLmNvbQ)  

Anime schedule in Google Sheets:  
[2019/spring](https://docs.google.com/spreadsheets/d/1cS8fEJFKy2JB24e8DWTwfDLudahcIE0muGT4hzRzoFw/edit?usp=sharing)  
[2019/summer](https://docs.google.com/spreadsheets/d/1ejrLQIgAbMQhmXHToe9bKQ79NVXumCpgM7sjjUf9zSc/edit?usp=sharing)
[2019/fall]()

## Using

This app requires 3 parameters to run:
 - SheetId
 - Range
 - CalendarId

You can pass this params after app starts or as start arguments:
 - `--sheetid ` for SheetId
 - `--range` for Range (use [this](https://developers.google.com/sheets/api/guides/concepts#a1_notation) syntax to use different sheets in same doc)
 - `--calendarid` for CalendarId

And now just start the app!

```bash
> node app --sheetid SheetId --range Range --calendarid CalendarId
```

## Contact

[Telegram](https://t.me/ejnshtein) or [Mail](https://ejnshtein@dsgstng.com)
