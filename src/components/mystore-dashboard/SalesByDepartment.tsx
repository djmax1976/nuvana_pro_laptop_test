"use client";

import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { PieChart, Pie, Cell, ResponsiveContainer } from "recharts";

/**
 * SalesByDepartment Component
 *
 * Displays a donut chart showing sales breakdown by department
 * with a center total and legend
 *
 * Story: MyStore Dashboard Redesign
 */

// Sample sales data - will be replaced with real API data
const salesData = [
  { name: "Fuel", value: 3245, color: "#0066FF" },
  { name: "Beverages", value: 1892, color: "#00C853" },
  { name: "Lottery", value: 1847, color: "#FF9800" },
  { name: "Snacks", value: 945, color: "#9C27B0" },
  { name: "Other", value: 523, color: "#e5e7eb" },
];

const total = salesData.reduce((sum, item) => sum + item.value, 0);

export function SalesByDepartment() {
  return (
    <Card
      className="min-h-[380px] flex flex-col"
      data-testid="sales-by-department"
    >
      <CardHeader className="flex flex-row items-center justify-between p-5 border-b">
        <CardTitle className="text-base font-semibold">Sales</CardTitle>
        <select className="px-3 py-1.5 text-sm text-muted-foreground bg-card border rounded-md cursor-pointer">
          <option>Today</option>
          <option>This Week</option>
          <option>This Month</option>
        </select>
      </CardHeader>
      <CardContent className="flex-1 p-5">
        {/* Donut Chart with Center Label */}
        <div className="flex flex-col items-center">
          <div className="relative w-[180px] h-[180px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={salesData}
                  cx="50%"
                  cy="50%"
                  innerRadius={55}
                  outerRadius={85}
                  paddingAngle={2}
                  dataKey="value"
                  stroke="none"
                >
                  {salesData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
            {/* Center label */}
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-3xl font-bold text-primary">
                ${(total / 1000).toFixed(1)}K
              </span>
              <span className="text-xs text-muted-foreground">Total</span>
            </div>
          </div>
        </div>

        {/* Legend */}
        <div className="flex flex-col gap-2 mt-4">
          {salesData.map((item) => (
            <div
              key={item.name}
              className="flex items-center justify-between text-sm"
            >
              <div className="flex items-center gap-2">
                <div
                  className="w-3 h-3 rounded-sm"
                  style={{ backgroundColor: item.color }}
                />
                <span>{item.name}</span>
              </div>
              <span className="font-semibold">
                ${item.value.toLocaleString()}
              </span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
