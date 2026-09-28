"""v0.4 learning path: two accounts per child, CDs, options, allowance, scenarios, XP

Revision ID: b4a0c1d2e3f4
Revises: 8696d11d7b96
Create Date: 2026-09-28
"""
import sqlalchemy as sa
from alembic import op

revision = "b4a0c1d2e3f4"
down_revision = "8696d11d7b96"
branch_labels = None
depends_on = None

MONEY = sa.Numeric(precision=24, scale=6)


def _unique_name(table: str, cols: list[str]) -> str | None:
    insp = sa.inspect(op.get_bind())
    for uc in insp.get_unique_constraints(table):
        if uc.get("column_names") == cols:
            return uc.get("name")
    return None


def upgrade() -> None:
    bind = op.get_bind()
    sqlite = bind.dialect.name == "sqlite"

    with op.batch_alter_table("child_profiles") as b:
        b.add_column(sa.Column("level_override", sa.Integer(), nullable=True))
        b.add_column(sa.Column("family_access", sa.String(length=8), nullable=False, server_default="all"))

    # simulation_accounts: one row per (profile, kind); existing rows become the family account.
    old_uc = _unique_name("simulation_accounts", ["profile_id"])
    naming = {"uq": "uq_%(table_name)s_%(column_0_name)s"}
    with op.batch_alter_table("simulation_accounts", naming_convention=naming if sqlite else None) as b:
        b.add_column(sa.Column("kind", sa.String(length=16), nullable=False, server_default="family"))
        if old_uc:
            b.drop_constraint(old_uc, type_="unique")
        elif sqlite:  # unnamed SQLite constraint gets the naming-convention name inside batch mode
            b.drop_constraint("uq_simulation_accounts_profile_id", type_="unique")
        b.create_unique_constraint("uq_account_kind", ["profile_id", "kind"])
        b.create_index("ix_simulation_accounts_profile_id", ["profile_id"], unique=False)

    with op.batch_alter_table("ledger_entries") as b:
        b.add_column(sa.Column("account_id", sa.String(length=32), nullable=True))
        b.create_index("ix_ledger_entries_account_id", ["account_id"], unique=False)
    with op.batch_alter_table("trades") as b:
        b.add_column(sa.Column("account_id", sa.String(length=32), nullable=True))
        b.create_index("ix_trades_account_id", ["account_id"], unique=False)
    for t in ("ledger_entries", "trades"):
        op.execute(f"UPDATE {t} SET account_id = (SELECT a.id FROM simulation_accounts a WHERE a.profile_id = {t}.profile_id "
                   f"AND a.kind = 'family') WHERE account_id IS NULL")
    with op.batch_alter_table("ledger_entries") as b:
        b.drop_constraint("uq_ledger_ref", type_="unique")
        b.create_unique_constraint("uq_ledger_ref", ["account_id", "epoch", "reference_id", "type"])

    op.create_table(
        "deposits",
        sa.Column("id", sa.String(length=32), primary_key=True),
        sa.Column("profile_id", sa.String(length=32), sa.ForeignKey("child_profiles.id"), nullable=False, index=True),
        sa.Column("account_id", sa.String(length=32), nullable=False, index=True),
        sa.Column("epoch", sa.Integer(), nullable=False),
        sa.Column("principal", MONEY, nullable=False),
        sa.Column("apy", sa.Numeric(precision=10, scale=6), nullable=False),
        sa.Column("term_months", sa.Integer(), nullable=False),
        sa.Column("opened_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("matures_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("status", sa.String(length=10), nullable=False),
        sa.Column("closed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("payout", MONEY, nullable=True),
    )
    op.create_table(
        "option_positions",
        sa.Column("id", sa.String(length=32), primary_key=True),
        sa.Column("profile_id", sa.String(length=32), sa.ForeignKey("child_profiles.id"), nullable=False, index=True),
        sa.Column("account_id", sa.String(length=32), nullable=False, index=True),
        sa.Column("epoch", sa.Integer(), nullable=False),
        sa.Column("underlying", sa.String(length=16), nullable=False),
        sa.Column("right", sa.String(length=4), nullable=False),
        sa.Column("strategy", sa.String(length=16), nullable=False),
        sa.Column("strike", MONEY, nullable=False),
        sa.Column("expiry", sa.Date(), nullable=False),
        sa.Column("contracts", sa.Integer(), nullable=False),
        sa.Column("open_premium", MONEY, nullable=False),
        sa.Column("open_underlying_price", MONEY, nullable=False),
        sa.Column("volatility", sa.Numeric(precision=10, scale=6), nullable=False),
        sa.Column("opened_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("status", sa.String(length=10), nullable=False),
        sa.Column("close_premium", MONEY, nullable=True),
        sa.Column("closed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("settlement_price", MONEY, nullable=True),
        sa.Column("realized_pnl", MONEY, nullable=True),
        sa.Column("journal_note", sa.Text(), nullable=True),
    )
    op.create_table(
        "allowance_schedules",
        sa.Column("id", sa.String(length=32), primary_key=True),
        sa.Column("profile_id", sa.String(length=32), sa.ForeignKey("child_profiles.id"), nullable=False, unique=True),
        sa.Column("amount", MONEY, nullable=False),
        sa.Column("frequency", sa.String(length=8), nullable=False),
        sa.Column("weekday", sa.Integer(), nullable=False),
        sa.Column("day_of_month", sa.Integer(), nullable=False),
        sa.Column("start_date", sa.Date(), nullable=False),
        sa.Column("enabled", sa.Boolean(), nullable=False),
        sa.Column("last_run_date", sa.Date(), nullable=True),
        sa.Column("note", sa.String(length=120), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_table(
        "scenario_runs",
        sa.Column("id", sa.String(length=32), primary_key=True),
        sa.Column("profile_id", sa.String(length=32), sa.ForeignKey("child_profiles.id"), nullable=False, index=True),
        sa.Column("scenario_id", sa.String(length=32), nullable=False, index=True),
        sa.Column("status", sa.String(length=8), nullable=False),
        sa.Column("step", sa.Integer(), nullable=False),
        sa.Column("decisions", sa.JSON(), nullable=False),
        sa.Column("result", sa.JSON(), nullable=True),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("finished_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_table(
        "xp_events",
        sa.Column("id", sa.String(length=32), primary_key=True),
        sa.Column("profile_id", sa.String(length=32), sa.ForeignKey("child_profiles.id"), nullable=False, index=True),
        sa.Column("kind", sa.String(length=24), nullable=False),
        sa.Column("ref", sa.String(length=96), nullable=False),
        sa.Column("points", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("profile_id", "kind", "ref", name="uq_xp_event"),
    )


def downgrade() -> None:
    for t in ("xp_events", "scenario_runs", "allowance_schedules", "option_positions", "deposits"):
        op.drop_table(t)
    for t in ("ledger_entries", "trades"):
        op.execute(f"DELETE FROM {t} WHERE account_id IN (SELECT id FROM simulation_accounts WHERE kind <> 'family')")
    with op.batch_alter_table("ledger_entries") as b:
        b.drop_constraint("uq_ledger_ref", type_="unique")
        b.create_unique_constraint("uq_ledger_ref", ["profile_id", "epoch", "reference_id", "type"])
        b.drop_index("ix_ledger_entries_account_id")
        b.drop_column("account_id")
    with op.batch_alter_table("trades") as b:
        b.drop_index("ix_trades_account_id")
        b.drop_column("account_id")
    op.execute("DELETE FROM simulation_accounts WHERE kind <> 'family'")
    with op.batch_alter_table("simulation_accounts") as b:
        b.drop_constraint("uq_account_kind", type_="unique")
        b.drop_index("ix_simulation_accounts_profile_id")
        b.drop_column("kind")
        b.create_unique_constraint("uq_simulation_accounts_profile_id", ["profile_id"])
    with op.batch_alter_table("child_profiles") as b:
        b.drop_column("family_access")
        b.drop_column("level_override")
