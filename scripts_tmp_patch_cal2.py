import subprocess

p = '/home/kriday/kamkazi/src/components/calendar-screen.tsx'
s = open(p).read()

# Wrap main content: agenda view renders AgendaGroupsView; day view keeps agenda list.
old_main = '''            {/* agenda / day plan */}
            <section className="min-w-0" aria-label="Agenda for selected day">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-[16px] font-bold tracking-tight">
                  {selected === today ? "Today" : longDate(selected)}
                </h2>
                <button
                  type="button"
                  onClick={() => {
                    setEditorFor("new");
                    setEditorDate(selected);
                  }}
                  className="tap text-[12.5px] font-semibold text-primary hover:underline"
                >
                  + Add to this day
                </button>
              </div>'''
new_main = '''            {/* agenda / day plan / master agenda view */}
            {view === "agenda" ? (
              <section className="min-w-0" aria-label="Master agenda — all tasks and events grouped">
                {loading ? (
                  <div className="panel px-3 py-4 text-[13px] text-muted-foreground">Loading…</div>
                ) : (
                  <AgendaGroupsView
                    events={liveEvents.map((e) => ({
                      id: e.id,
                      title: e.title,
                      date: e.date,
                      start: e.start,
                      allDay: e.allDay,
                      calendar: e.calendar,
                      colour: e.colour,
                    }))}
                  />
                )}
              </section>
            ) : (
            <section className="min-w-0" aria-label="Agenda for selected day">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-[16px] font-bold tracking-tight">
                  {selected === today ? "Today" : longDate(selected)}
                </h2>
                <button
                  type="button"
                  onClick={() => {
                    setEditorFor("new");
                    setEditorDate(selected);
                  }}
                  className="tap text-[12.5px] font-semibold text-primary hover:underline"
                >
                  + Add to this day
                </button>
              </div>'''
assert old_main in s, "main head not found"
s = s.replace(old_main, new_main, 1)

# Close the conditional: the section ends after the quick-capture form </form>\n            </section>
old_close = '''              </form>
            </section>
          </div>
        </div>'''
new_close = '''              </form>
            </section>
            )}
          </div>
        </div>'''
assert old_close in s, "close not found"
s = s.replace(old_close, new_close, 1)

open(p, 'w').write(s)
print("main content wiring OK")